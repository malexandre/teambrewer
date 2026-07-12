import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../../test/database.js";
import {
  addMembership,
  createDeck,
  createDecision,
  createEvent,
  createFormat,
  createGame,
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
 * Endpoint tests for the decisions log. The critical properties are tenant isolation (a
 * team never reaches another team's decisions), the polymorphic `relatedSubjectRef`
 * round-trip + same-team validation (a cross-team subject → 404), and edit permission
 * (author or team-admin only). There is no delete — the log is append-oriented.
 */
describe("Decisions endpoints (integration)", () => {
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

  const validBody = () => ({
    title: "Register Fai for Nationals",
    context: "We tested five decks over three weeks.",
    decision: "Bring Fai as the main; Kano as pocket.",
    rationale: "Best coverage against the expected aggro-heavy field.",
  });

  describe("POST /api/decisions", () => {
    it("records a decision and stamps the author + decidedAt", async () => {
      const response = await asMemberA(http().post("/api/decisions")).send(validBody());
      expect(response.status).toBe(201);
      expect(response.body.title).toBe("Register Fai for Nationals");
      expect(response.body.authorId).toBe(memberA.id);
      expect(response.body.relatedSubjectRef).toBeNull();
      expect(typeof response.body.decidedAt).toBe("string");
    });

    it("round-trips a same-team related-subject ref and captures a snapshot label", async () => {
      const event = await createEvent(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        name: "Nationals",
      });
      const response = await asMemberA(http().post("/api/decisions")).send({
        ...validBody(),
        relatedSubjectRef: { subjectType: "event", subjectId: event.id },
      });
      expect(response.status).toBe(201);
      expect(response.body.relatedSubjectRef).toEqual({
        subjectType: "event",
        subjectId: event.id,
      });
      expect(response.body.relatedSubjectSnapshotLabel).toBe("Nationals");
    });

    it("resolves a deck ref to the deck name", async () => {
      const response = await asMemberA(http().post("/api/decisions")).send({
        ...validBody(),
        relatedSubjectRef: { subjectType: "deck", subjectId: deckA.id },
      });
      expect(response.status).toBe(201);
      expect(response.body.relatedSubjectSnapshotLabel).toBe("Aggro Dori");
    });

    it("rejects a related-subject ref pointing at another team's subject (404)", async () => {
      const response = await asMemberA(http().post("/api/decisions")).send({
        ...validBody(),
        relatedSubjectRef: { subjectType: "deck", subjectId: deckB.id },
      });
      expect(response.status).toBe(404);
    });

    it("rejects a malformed body (400)", async () => {
      const response = await asMemberA(http().post("/api/decisions")).send({
        title: "Missing fields",
      });
      expect(response.status).toBe(400);
    });

    it("rejects an unauthenticated request (401)", async () => {
      const response = await http().post("/api/decisions").send(validBody());
      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/decisions", () => {
    it("lists newest-decided first and does not leak another team's decisions", async () => {
      await createDecision(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        title: "Older",
        decidedAt: new Date("2026-06-01T00:00:00.000Z"),
      });
      await createDecision(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        title: "Newer",
        decidedAt: new Date("2026-07-01T00:00:00.000Z"),
      });
      await createDecision(prisma, { teamId: teamB.id, authorId: memberB.id, title: "Bravo only" });

      const response = await asMemberA(http().get("/api/decisions"));
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].title).toBe("Newer");
      expect(response.body.data[1].title).toBe("Older");
    });

    it("keyset-paginates", async () => {
      for (let index = 0; index < 3; index += 1) {
        await createDecision(prisma, {
          teamId: teamA.id,
          authorId: memberA.id,
          decidedAt: new Date(`2026-07-0${index + 1}T00:00:00.000Z`),
        });
      }
      const first = await asMemberA(http().get("/api/decisions").query({ limit: 2 }));
      expect(first.body.data).toHaveLength(2);
      expect(first.body.nextCursor).not.toBeNull();
      const second = await asMemberA(
        http().get("/api/decisions").query({ limit: 2, cursor: first.body.nextCursor }),
      );
      const firstIds = new Set(first.body.data.map((decision: { id: string }) => decision.id));
      for (const decision of second.body.data) {
        expect(firstIds.has(decision.id)).toBe(false);
      }
    });
  });

  describe("tenant isolation", () => {
    it("returns 404 reading another team's decision", async () => {
      const foreign = await createDecision(prisma, { teamId: teamB.id, authorId: memberB.id });
      const response = await asMemberA(http().get(`/api/decisions/${foreign.id}`));
      expect(response.status).toBe(404);
    });

    it("returns 403 when a member forges another team's X-Team-Id", async () => {
      const response = await http()
        .get("/api/decisions")
        .set("x-test-user-id", memberA.id)
        .set("x-team-id", teamB.id);
      expect(response.status).toBe(403);
    });

    it("cannot edit another team's decision (404)", async () => {
      const foreign = await createDecision(prisma, { teamId: teamB.id, authorId: memberB.id });
      const response = await asMemberA(http().patch(`/api/decisions/${foreign.id}`)).send({
        rationale: "Hijacked",
      });
      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/decisions/:decisionId", () => {
    it("lets the author correct their decision", async () => {
      const decision = await createDecision(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA(http().patch(`/api/decisions/${decision.id}`)).send({
        rationale: "Refined rationale.",
      });
      expect(response.status).toBe(200);
      expect(response.body.rationale).toBe("Refined rationale.");
    });

    it("lets a team-admin correct any decision", async () => {
      const decision = await createDecision(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asAdminA(http().patch(`/api/decisions/${decision.id}`)).send({
        title: "Corrected title",
      });
      expect(response.status).toBe(200);
    });

    it("forbids a non-author, non-admin member from editing (403)", async () => {
      const decision = await createDecision(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA2(http().patch(`/api/decisions/${decision.id}`)).send({
        title: "Nope",
      });
      expect(response.status).toBe(403);
    });

    it("clears a related-subject ref with null", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id, formatId: fabFormatId });
      const decision = await createDecision(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        relatedSubjectType: "event",
        relatedSubjectId: event.id,
        relatedSubjectSnapshotLabel: "Some event",
      });
      const response = await asMemberA(http().patch(`/api/decisions/${decision.id}`)).send({
        relatedSubjectRef: null,
      });
      expect(response.status).toBe(200);
      expect(response.body.relatedSubjectRef).toBeNull();
      expect(response.body.relatedSubjectSnapshotLabel).toBeNull();
    });
  });
});
