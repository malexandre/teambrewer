import type { INestApplication } from "@nestjs/common";
import { Client } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import {
  createTestPrismaClient,
  createUser,
  seedTwoTeams,
  type TwoTeamWorld,
} from "../../test/factories.js";
import { createApiTestApp } from "../../test/nest-app.js";
import { AppModule } from "../app.module.js";
import { InviteTokenService } from "../auth/invite-token.service.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";

describe("Admin endpoints (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let world: TwoTeamWorld;

  beforeAll(async () => {
    app = await createApiTestApp([AppModule]);
    prisma = createTestPrismaClient();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  beforeEach(async () => {
    const resetClient: Client = createDatabaseClient();
    await resetClient.connect();
    await resetDatabase(resetClient);
    await resetClient.end();
    world = await seedTwoTeams(prisma);
  });

  const http = () => request(app.getHttpServer());

  describe("teams (instance-admin only)", () => {
    it("creates a team with its game and an optional first admin", async () => {
      const response = await http()
        .post("/api/admin/teams")
        .set("x-test-user-id", world.instanceAdmin.id)
        .set("x-test-instance-admin", "true")
        .send({
          name: "Charlie Squad",
          gameId: "flesh-and-blood",
          firstAdminUserId: world.memberB.id,
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ name: "Charlie Squad", gameId: "flesh-and-blood" });
      expect(response.body.slug).toBe("charlie-squad");
      const membership = await prisma.teamMembership.findFirst({
        where: { teamId: response.body.id, userId: world.memberB.id },
      });
      expect(membership?.role).toBe("team_admin");
    });

    it("rejects a non-instance-admin (403) and an unauthenticated caller (401)", async () => {
      const forbidden = await http()
        .post("/api/admin/teams")
        .set("x-test-user-id", world.teamAdminA.id)
        .send({ name: "Nope", gameId: "flesh-and-blood" });
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.error.code).toBe("FORBIDDEN");

      const unauth = await http()
        .post("/api/admin/teams")
        .send({ name: "Nope", gameId: "flesh-and-blood" });
      expect(unauth.status).toBe(401);
      expect(unauth.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("lists and archives teams", async () => {
      const list = await http()
        .get("/api/admin/teams")
        .set("x-test-user-id", world.instanceAdmin.id)
        .set("x-test-instance-admin", "true");
      expect(list.status).toBe(200);
      expect(list.body.data.length).toBe(2);

      const archived = await http()
        .delete(`/api/admin/teams/${world.teamA.id}`)
        .set("x-test-user-id", world.instanceAdmin.id)
        .set("x-test-instance-admin", "true");
      expect(archived.status).toBe(204);
      const team = await prisma.team.findUnique({ where: { id: world.teamA.id } });
      expect(team?.archivedAt).not.toBeNull();
    });
  });

  describe("account management (TeamAdminGuard, Option C path)", () => {
    it("creates an account + membership and returns one unified invite link (invitee chooses method)", async () => {
      const response = await http()
        .post(`/api/admin/teams/${world.teamA.id}/users`)
        .set("x-test-user-id", world.teamAdminA.id)
        .send({ username: "rookie", displayName: "Rookie", role: "member" });

      expect(response.status).toBe(201);
      expect(response.body.user).toMatchObject({ username: "rookie" });
      // A single method-agnostic invite — the invitee picks password or Discord on the claim page.
      expect(response.body.link.purpose).toBe("setup");
      expect(response.body.link.url).toContain("/setup/");
      const membership = await prisma.teamMembership.findFirst({
        where: { teamId: world.teamA.id, user: { username: "rookie" } },
      });
      expect(membership?.role).toBe("member");
    });

    it("does not require (or accept) a login method at creation", async () => {
      const response = await http()
        .post(`/api/admin/teams/${world.teamA.id}/users`)
        .set("x-test-user-id", world.teamAdminA.id)
        // authMethod is ignored if sent — the schema no longer carries it.
        .send({
          username: "chooser",
          displayName: "Chooser",
          authMethod: "discord",
          role: "member",
        });

      expect(response.status).toBe(201);
      expect(response.body.link.purpose).toBe("setup");
      expect(response.body.link.url).toContain("/setup/");
    });

    it("forbids a plain member from creating accounts (403)", async () => {
      const response = await http()
        .post(`/api/admin/teams/${world.teamA.id}/users`)
        .set("x-test-user-id", world.memberA.id)
        .send({ username: "x", displayName: "X", authMethod: "password_totp", role: "member" });
      expect(response.status).toBe(403);
    });

    it("forbids a team-admin of A from managing team B (cross-team, 403)", async () => {
      const response = await http()
        .post(`/api/admin/teams/${world.teamB.id}/users`)
        .set("x-test-user-id", world.teamAdminA.id)
        .send({ username: "x", displayName: "X", authMethod: "password_totp", role: "member" });
      expect(response.status).toBe(403);
    });

    it("404s when targeting a user who is not a member of the acting team", async () => {
      const response = await http()
        .post(`/api/admin/teams/${world.teamA.id}/users/${world.memberB.id}/setup-link`)
        .set("x-test-user-id", world.teamAdminA.id);
      expect(response.status).toBe(404);
    });

    it("rejects a password reset for a Discord account (422)", async () => {
      const discordUser = await createUser(prisma, { authMethod: "discord", username: "d_user" });
      await prisma.teamMembership.create({
        data: { teamId: world.teamA.id, userId: discordUser.id, role: "member" },
      });

      const response = await http()
        .post(`/api/admin/teams/${world.teamA.id}/users/${discordUser.id}/reset-link`)
        .set("x-test-user-id", world.teamAdminA.id);
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("LOGIN_METHOD_MISMATCH");
    });
  });

  describe("membership + last-admin guard", () => {
    it("lists members of the acting team", async () => {
      const response = await http()
        .get(`/api/admin/teams/${world.teamA.id}/members`)
        .set("x-test-user-id", world.teamAdminA.id);
      expect(response.status).toBe(200);
      const usernames = response.body.data.map((member: { username: string }) => member.username);
      expect(usernames).toContain("admin_alpha");
      expect(usernames).toContain("member_alpha");
      expect(usernames).not.toContain("member_bravo");
    });

    it("blocks demoting or removing the last team-admin (422)", async () => {
      const demote = await http()
        .patch(`/api/admin/teams/${world.teamA.id}/members/${world.teamAdminA.id}`)
        .set("x-test-user-id", world.teamAdminA.id)
        .send({ role: "member" });
      expect(demote.status).toBe(422);
      expect(demote.body.error.code).toBe("LAST_TEAM_ADMIN");

      const remove = await http()
        .delete(`/api/admin/teams/${world.teamA.id}/members/${world.teamAdminA.id}`)
        .set("x-test-user-id", world.teamAdminA.id);
      expect(remove.status).toBe(422);
    });

    it("allows demoting a former last-admin once another admin exists", async () => {
      const promote = await http()
        .patch(`/api/admin/teams/${world.teamA.id}/members/${world.memberA.id}`)
        .set("x-test-user-id", world.teamAdminA.id)
        .send({ role: "team_admin" });
      expect(promote.status).toBe(200);

      const demote = await http()
        .patch(`/api/admin/teams/${world.teamA.id}/members/${world.teamAdminA.id}`)
        .set("x-test-user-id", world.teamAdminA.id)
        .send({ role: "member" });
      expect(demote.status).toBe(200);
      expect(demote.body.role).toBe("member");
    });

    it("adds an existing user as a member", async () => {
      const newcomer = await createUser(prisma, { username: "newcomer" });
      const response = await http()
        .post(`/api/admin/teams/${world.teamA.id}/members`)
        .set("x-test-user-id", world.teamAdminA.id)
        .send({ userId: newcomer.id, role: "member" });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ username: "newcomer", role: "member" });
    });

    it("adds an existing user as a member by username", async () => {
      await createUser(prisma, { username: "newcomer" });
      const response = await http()
        .post(`/api/admin/teams/${world.teamA.id}/members`)
        .set("x-test-user-id", world.teamAdminA.id)
        .send({ username: "newcomer", role: "team_admin" });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ username: "newcomer", role: "team_admin" });
    });

    it("422s when adding a username that does not exist", async () => {
      const response = await http()
        .post(`/api/admin/teams/${world.teamA.id}/members`)
        .set("x-test-user-id", world.teamAdminA.id)
        .send({ username: "ghost", role: "member" });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("DOMAIN_RULE_VIOLATION");
    });

    it("409s when the named user is already a member", async () => {
      const response = await http()
        .post(`/api/admin/teams/${world.teamA.id}/members`)
        .set("x-test-user-id", world.teamAdminA.id)
        .send({ username: "member_alpha", role: "member" });
      expect(response.status).toBe(409);
    });

    it("400s when neither userId nor username is provided", async () => {
      const response = await http()
        .post(`/api/admin/teams/${world.teamA.id}/members`)
        .set("x-test-user-id", world.teamAdminA.id)
        .send({ role: "member" });
      expect(response.status).toBe(400);
    });

    it("lets an instance-admin add a member to a team they do not belong to", async () => {
      // world.instanceAdmin is a member of neither team A nor team B.
      const response = await http()
        .post(`/api/admin/teams/${world.teamB.id}/members`)
        .set("x-test-user-id", world.instanceAdmin.id)
        .set("x-test-instance-admin", "true")
        .send({ username: "member_alpha", role: "member" });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ username: "member_alpha", role: "member" });
    });
  });

  describe("invite link revocation", () => {
    it("revokes a member's outstanding invite link so it can no longer be used", async () => {
      const inviteTokens = new InviteTokenService(prisma as unknown as PrismaService);
      const { rawToken } = await inviteTokens.issue({
        userId: world.memberA.id,
        teamId: world.teamA.id,
        purpose: "setup",
      });
      expect((await http().get(`/api/onboarding/invite/${rawToken}`)).body).toEqual({
        valid: true,
      });

      const revoke = await http()
        .post(`/api/admin/teams/${world.teamA.id}/users/${world.memberA.id}/revoke-link`)
        .set("x-test-user-id", world.teamAdminA.id);
      expect(revoke.status).toBe(204);

      expect((await http().get(`/api/onboarding/invite/${rawToken}`)).body).toEqual({
        valid: false,
      });
    });

    it("404s revoking links for a user who is not a member of the acting team", async () => {
      const response = await http()
        .post(`/api/admin/teams/${world.teamA.id}/users/${world.memberB.id}/revoke-link`)
        .set("x-test-user-id", world.teamAdminA.id);
      expect(response.status).toBe(404);
    });
  });

  describe("instance-admin flag", () => {
    it("lets an instance-admin grant the flag and forbids others", async () => {
      const granted = await http()
        .patch(`/api/admin/users/${world.memberA.id}`)
        .set("x-test-user-id", world.instanceAdmin.id)
        .set("x-test-instance-admin", "true")
        .send({ isInstanceAdmin: true });
      expect(granted.status).toBe(200);
      expect(granted.body.isInstanceAdmin).toBe(true);

      const forbidden = await http()
        .patch(`/api/admin/users/${world.memberA.id}`)
        .set("x-test-user-id", world.teamAdminA.id)
        .send({ isInstanceAdmin: true });
      expect(forbidden.status).toBe(403);
    });
  });
});
