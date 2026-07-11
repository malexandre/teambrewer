import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Client } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient, seedTwoTeams, type TwoTeamWorld } from "../../test/factories.js";
import { createApiTestApp } from "../../test/nest-app.js";
import { AppModule } from "../app.module.js";
import type { PrismaClient } from "../generated/prisma/client.js";

describe("Self-service + member roster (integration)", () => {
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

  it("requires authentication for /api/me (401)", async () => {
    const response = await http().get("/api/me");
    expect(response.status).toBe(401);
  });

  it("returns the caller's own profile", async () => {
    const response = await http().get("/api/me").set("x-test-user-id", world.memberA.id);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: world.memberA.id,
      username: "member_alpha",
      authMethod: "password_totp",
      totpEnabled: false,
    });
  });

  it("lists only the teams the caller belongs to", async () => {
    const response = await http().get("/api/me/teams").set("x-test-user-id", world.memberA.id);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ teamId: world.teamA.id, role: "member" });
  });

  it("lists the active team's members via the X-Team-Id header", async () => {
    const response = await http()
      .get("/api/members")
      .set("x-test-user-id", world.memberA.id)
      .set("x-team-id", world.teamA.id);
    expect(response.status).toBe(200);
    const usernames = response.body.data.map((member: { username: string }) => member.username);
    expect(usernames).toContain("member_alpha");
    expect(usernames).not.toContain("member_bravo");
  });

  it("denies the roster of a team the caller does not belong to (forged X-Team-Id -> 403)", async () => {
    const response = await http()
      .get("/api/members")
      .set("x-test-user-id", world.memberA.id)
      .set("x-team-id", world.teamB.id);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("TENANT_FORBIDDEN");
  });

  it("unlinks the caller's identity-only Discord link", async () => {
    await prisma.user.update({
      where: { id: world.memberA.id },
      data: { discordUserId: "discord-self", discordUsername: "Self" },
    });

    const response = await http()
      .delete("/api/me/discord/link")
      .set("x-test-user-id", world.memberA.id);
    expect(response.status).toBe(204);
    const after = await prisma.user.findUnique({
      where: { id: world.memberA.id },
      select: { discordUserId: true },
    });
    expect(after?.discordUserId).toBeNull();
  });

  describe("sessions", () => {
    async function seedSession(userId: string): Promise<string> {
      const id = randomUUID();
      await prisma.session.create({
        data: {
          id,
          token: randomUUID(),
          userId,
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      return id;
    }

    it("lists the caller's sessions", async () => {
      await seedSession(world.memberA.id);
      const response = await http()
        .get("/api/me/sessions")
        .set("x-test-user-id", world.memberA.id);
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
    });

    it("signs out one of the caller's own sessions", async () => {
      const sessionId = await seedSession(world.memberA.id);
      const response = await http()
        .delete(`/api/me/sessions/${sessionId}`)
        .set("x-test-user-id", world.memberA.id);
      expect(response.status).toBe(204);
      const remaining = await prisma.session.findUnique({ where: { id: sessionId } });
      expect(remaining).toBeNull();
    });

    it("cannot sign out another user's session (404, not cross-user)", async () => {
      const othersSession = await seedSession(world.memberB.id);
      const response = await http()
        .delete(`/api/me/sessions/${othersSession}`)
        .set("x-test-user-id", world.memberA.id);
      expect(response.status).toBe(404);
      const stillThere = await prisma.session.findUnique({ where: { id: othersSession } });
      expect(stillThere).not.toBeNull();
    });
  });
});
