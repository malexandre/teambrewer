import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../../test/database.js";
import {
  addMembership,
  createDeck,
  createFormat,
  createGame,
  createPrimer,
  createTeam,
  createTestPrismaClient,
  createUser,
  type TestDeck,
  type TestTeam,
  type TestUser,
} from "../../../test/factories.js";
import { createApiTestApp } from "../../../test/nest-app.js";
import { AppModule } from "../../app.module.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

/**
 * Endpoint tests for primers. The critical properties are tenant isolation (a team
 * never reaches another team's primers), the private-visibility rule (a private draft is
 * hidden from other members but visible to its author and team-admins), cross-team FK
 * rejection for `relatedDeckId`, and archive permission (author or team-admin only).
 */
describe("Primers endpoints (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let teamA: TestTeam;
  let teamB: TestTeam;
  let adminA: TestUser;
  let memberA: TestUser;
  let memberA2: TestUser;
  let memberB: TestUser;

  let fabFormatId: string;
  let deckA: TestDeck;
  let deckB: TestDeck;

  beforeAll(async () => {
    app = await createApiTestApp([AppModule]);
    prisma = createTestPrismaClient();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  beforeEach(async () => {
    const client = createDatabaseClient();
    await client.connect();
    await resetDatabase(client);
    await client.end();

    await createGame(prisma, {
      id: "flesh-and-blood",
      key: "flesh_and_blood",
      name: "Flesh and Blood",
    });

    teamA = await createTeam(prisma, { name: "Alpha", gameId: "flesh-and-blood" });
    teamB = await createTeam(prisma, { name: "Bravo", gameId: "flesh-and-blood" });
    adminA = await createUser(prisma, { username: "admin_a" });
    memberA = await createUser(prisma, { username: "member_a" });
    memberA2 = await createUser(prisma, { username: "member_a2" });
    memberB = await createUser(prisma, { username: "member_b" });
    await addMembership(prisma, { teamId: teamA.id, userId: adminA.id, role: "team_admin" });
    await addMembership(prisma, { teamId: teamA.id, userId: memberA.id, role: "member" });
    await addMembership(prisma, { teamId: teamA.id, userId: memberA2.id, role: "member" });
    await addMembership(prisma, { teamId: teamB.id, userId: memberB.id, role: "member" });

    fabFormatId = (
      await createFormat(prisma, { gameId: "flesh-and-blood", key: "cc", name: "Classic" })
    ).id;
    deckA = await createDeck(prisma, {
      teamId: teamA.id,
      ownerId: memberA.id,
      formatId: fabFormatId,
      name: "Aggro Dori",
    });
    deckB = await createDeck(prisma, {
      teamId: teamB.id,
      ownerId: memberB.id,
      formatId: fabFormatId,
    });
  });

  const http = () => request(app.getHttpServer());
  const asMemberA = (req: request.Test) =>
    req.set("x-test-user-id", memberA.id).set("x-team-id", teamA.id);
  const asMemberA2 = (req: request.Test) =>
    req.set("x-test-user-id", memberA2.id).set("x-team-id", teamA.id);
  const asAdminA = (req: request.Test) =>
    req.set("x-test-user-id", adminA.id).set("x-team-id", teamA.id);
  const asMemberB = (req: request.Test) =>
    req.set("x-test-user-id", memberB.id).set("x-team-id", teamB.id);

  const validBody = () => ({
    title: "Beating Aggro Fai",
    kind: "matchup" as const,
    body: "Keep two blues; block the on-hit triggers.",
  });

  describe("POST /api/primers", () => {
    it("creates a primer and stamps the author", async () => {
      const response = await asMemberA(http().post("/api/primers")).send(validBody());
      expect(response.status).toBe(201);
      expect(response.body.title).toBe("Beating Aggro Fai");
      expect(response.body.authorId).toBe(memberA.id);
      expect(response.body.author.username).toBe("member_a");
      expect(response.body.visibility).toBe("team");
      expect(response.body.body).toBe("Keep two blues; block the on-hit triggers.");
    });

    it("accepts a same-team related deck and exposes its name", async () => {
      const response = await asMemberA(http().post("/api/primers")).send({
        ...validBody(),
        kind: "deck_primer",
        relatedDeckId: deckA.id,
      });
      expect(response.status).toBe(201);
      expect(response.body.relatedDeckId).toBe(deckA.id);
      expect(response.body.relatedDeckName).toBe("Aggro Dori");
    });

    it("rejects a related deck from another team (422)", async () => {
      const response = await asMemberA(http().post("/api/primers")).send({
        ...validBody(),
        relatedDeckId: deckB.id,
      });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("DOMAIN_RULE_VIOLATION");
    });

    it("rejects an unauthenticated request (401)", async () => {
      const response = await http().post("/api/primers").send(validBody());
      expect(response.status).toBe(401);
    });

    it("ignores a client-supplied teamId/authorId (tenancy stamped from context)", async () => {
      const response = await asMemberA(http().post("/api/primers")).send({
        ...validBody(),
        teamId: teamB.id,
        authorId: memberB.id,
      });
      expect(response.status).toBe(201);
      expect(response.body.authorId).toBe(memberA.id);
      const stored = await prisma.primer.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(stored.teamId).toBe(teamA.id);
    });
  });

  describe("GET /api/primers", () => {
    it("lists the team's primers and filters by kind", async () => {
      await createPrimer(prisma, { teamId: teamA.id, authorId: memberA.id, kind: "matchup" });
      await createPrimer(prisma, { teamId: teamA.id, authorId: memberA.id, kind: "format_notes" });
      const all = await asMemberA(http().get("/api/primers"));
      expect(all.body.data).toHaveLength(2);
      const filtered = await asMemberA(http().get("/api/primers").query({ kind: "matchup" }));
      expect(filtered.body.data).toHaveLength(1);
      expect(filtered.body.data[0].kind).toBe("matchup");
    });

    it("keyset-paginates newest-first", async () => {
      for (let index = 0; index < 3; index += 1) {
        await createPrimer(prisma, { teamId: teamA.id, authorId: memberA.id });
      }
      const first = await asMemberA(http().get("/api/primers").query({ limit: 2 }));
      expect(first.body.data).toHaveLength(2);
      expect(first.body.nextCursor).not.toBeNull();
      const second = await asMemberA(
        http().get("/api/primers").query({ limit: 2, cursor: first.body.nextCursor }),
      );
      const firstIds = new Set(first.body.data.map((primer: { id: string }) => primer.id));
      for (const primer of second.body.data) {
        expect(firstIds.has(primer.id)).toBe(false);
      }
    });

    it("does not return another team's primers", async () => {
      await createPrimer(prisma, { teamId: teamB.id, authorId: memberB.id });
      const response = await asMemberA(http().get("/api/primers"));
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe("visibility", () => {
    it("hides another member's private primer from the list and single read (404)", async () => {
      const priv = await createPrimer(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        visibility: "private",
      });
      const list = await asMemberA2(http().get("/api/primers"));
      expect(list.body.data).toHaveLength(0);
      const read = await asMemberA2(http().get(`/api/primers/${priv.id}`));
      expect(read.status).toBe(404);
    });

    it("shows a private primer to its author and to a team-admin", async () => {
      const priv = await createPrimer(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        visibility: "private",
      });
      const asAuthor = await asMemberA(http().get(`/api/primers/${priv.id}`));
      expect(asAuthor.status).toBe(200);
      const asAdmin = await asAdminA(http().get(`/api/primers/${priv.id}`));
      expect(asAdmin.status).toBe(200);
    });
  });

  describe("tenant isolation", () => {
    it("returns 404 reading another team's primer", async () => {
      const foreign = await createPrimer(prisma, { teamId: teamB.id, authorId: memberB.id });
      const response = await asMemberA(http().get(`/api/primers/${foreign.id}`));
      expect(response.status).toBe(404);
    });

    it("returns 403 when a member forges another team's X-Team-Id", async () => {
      const response = await http()
        .get("/api/primers")
        .set("x-test-user-id", memberA.id)
        .set("x-team-id", teamB.id);
      expect(response.status).toBe(403);
    });

    it("cannot update or archive another team's primer (404)", async () => {
      const foreign = await createPrimer(prisma, { teamId: teamB.id, authorId: memberB.id });
      const patched = await asMemberA(http().patch(`/api/primers/${foreign.id}`)).send({
        title: "Hijacked",
      });
      expect(patched.status).toBe(404);
      const archived = await asMemberA(http().delete(`/api/primers/${foreign.id}`));
      expect(archived.status).toBe(404);
      const stored = await prisma.primer.findUniqueOrThrow({ where: { id: foreign.id } });
      expect(stored.title).not.toBe("Hijacked");
      expect(stored.archivedAt).toBeNull();
    });
  });

  describe("PATCH /api/primers/:primerId", () => {
    it("lets any member edit a team primer", async () => {
      const primer = await createPrimer(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA2(http().patch(`/api/primers/${primer.id}`)).send({
        body: "Revised notes.",
      });
      expect(response.status).toBe(200);
      expect(response.body.body).toBe("Revised notes.");
    });

    it("rejects an empty update (400)", async () => {
      const primer = await createPrimer(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA(http().patch(`/api/primers/${primer.id}`)).send({});
      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /api/primers/:primerId (archive)", () => {
    it("lets the author archive their primer", async () => {
      const primer = await createPrimer(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA(http().delete(`/api/primers/${primer.id}`));
      expect(response.status).toBe(204);
      const stored = await prisma.primer.findUniqueOrThrow({ where: { id: primer.id } });
      expect(stored.archivedAt).not.toBeNull();
    });

    it("lets a team-admin archive any team primer", async () => {
      const primer = await createPrimer(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asAdminA(http().delete(`/api/primers/${primer.id}`));
      expect(response.status).toBe(204);
    });

    it("forbids a non-author, non-admin member from archiving (403)", async () => {
      const primer = await createPrimer(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA2(http().delete(`/api/primers/${primer.id}`));
      expect(response.status).toBe(403);
    });
  });

  describe("collaboration integration", () => {
    it("records a scoped notification and activity when a teammate is @mentioned", async () => {
      const primer = await createPrimer(prisma, { teamId: teamA.id, authorId: memberA.id });
      const comment = await asMemberA(http().post("/api/comments")).send({
        subjectType: "primer",
        subjectId: primer.id,
        body: "hey @member_a2 read this primer",
      });
      expect(comment.status).toBe(201);

      const notifications = await asMemberA2(http().get("/api/notifications"));
      expect(notifications.body.data).toHaveLength(1);
      expect(notifications.body.data[0].subjectType).toBe("primer");
      expect(notifications.body.data[0].subjectId).toBe(primer.id);

      const activity = await asMemberA(
        http().get("/api/activity").query({ subjectType: "primer", subjectId: primer.id }),
      );
      expect(activity.status).toBe(200);
      expect(activity.body.data.some((event: { verb: string }) => event.verb === "commented")).toBe(
        true,
      );

      // memberB (team B) never sees the notification or the primer's activity.
      const bravoInbox = await asMemberB(http().get("/api/notifications"));
      expect(bravoInbox.body.data).toHaveLength(0);
    });
  });
});
