import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import {
  addMembership,
  createDeck,
  createEvent,
  createFormat,
  createGame,
  createGameLog,
  createHero,
  createTeam,
  createTestPrismaClient,
  createUser,
  type TestDeck,
  type TestTeam,
  type TestUser,
} from "../../test/factories.js";
import { createApiTestApp } from "../../test/nest-app.js";
import { AppModule } from "../app.module.js";
import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Endpoint tests for game logging. The critical properties are the
 * server-authoritative confidence weight (never client-supplied), tenant isolation
 * (a team never reaches another team's logs, and a log cannot reference another
 * team's deck/event), the result/best-of and opponent-identity rules, logger/admin
 * ownership on edits, and the aggregation feed (raw N + Σ weights) phase-07 builds
 * on. A two-team Flesh and Blood world plus a Riftbound game backs the suite.
 */
describe("Game-log endpoints (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let teamA: TestTeam;
  let teamB: TestTeam;
  let adminA: TestUser;
  let memberA: TestUser;
  let memberA2: TestUser;
  let memberB: TestUser;

  let fabFormatId: string;
  let fabHeroId: string;
  let riftFormatId: string;
  let riftHeroId: string;

  let deckA: TestDeck;
  let deckA2: TestDeck;
  let referenceDeckA: TestDeck;
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
    await createGame(prisma, { id: "riftbound", key: "riftbound", name: "Riftbound" });

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
      await createFormat(prisma, {
        gameId: "flesh-and-blood",
        key: "cc",
        name: "Classic Constructed",
      })
    ).id;
    fabHeroId = (await createHero(prisma, { gameId: "flesh-and-blood", name: "Dorinthea" })).id;
    riftFormatId = (
      await createFormat(prisma, { gameId: "riftbound", key: "standard", name: "Standard" })
    ).id;
    riftHeroId = (await createHero(prisma, { gameId: "riftbound", name: "Rift Legend" })).id;

    deckA = await createDeck(prisma, {
      teamId: teamA.id,
      ownerId: memberA.id,
      formatId: fabFormatId,
      name: "Our Deck",
    });
    deckA2 = await createDeck(prisma, {
      teamId: teamA.id,
      ownerId: memberA2.id,
      formatId: fabFormatId,
      name: "Teammate Deck",
    });
    referenceDeckA = await createDeck(prisma, {
      teamId: teamA.id,
      ownerId: adminA.id,
      formatId: fabFormatId,
      name: "Reference Deck",
      isReference: true,
    });
    deckB = await createDeck(prisma, {
      teamId: teamB.id,
      ownerId: memberB.id,
      formatId: fabFormatId,
      name: "Team B Deck",
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

  const validGame = () => ({
    formatId: fabFormatId,
    sideA: { pilotUserId: memberA.id, deckId: deckA.id },
    sideB: { heroId: fabHeroId },
    firstPlayerSide: "A" as const,
    bestOf: 3 as const,
    result: { gamesWonA: 2, gamesWonB: 1 },
  });

  describe("POST /api/game-logs", () => {
    it("logs a game, deriving the confidence weight and stamping teamId/loggedById", async () => {
      const response = await asMemberA(http().post("/api/game-logs")).send(validGame());
      expect(response.status).toBe(201);
      // Defaults are all-best → weight 1.0.
      expect(response.body.confidenceWeight).toBeCloseTo(1, 4);
      expect(response.body.loggedById).toBe(memberA.id);
      expect(response.body.sideB.heroId).toBe(fabHeroId);

      const persisted = await prisma.gameLog.findUnique({ where: { id: response.body.id } });
      expect(persisted?.teamId).toBe(teamA.id);
      expect(persisted?.loggedById).toBe(memberA.id);
    });

    it("ignores a client-supplied confidenceWeight and derives it from the factors", async () => {
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        confidenceWeight: 0.01,
        confidenceFactors: {
          skillParity: "evenly_matched",
          seriousness: "tournament_serious",
          deckMaturity: "partially_tuned",
          pilotFamiliarity: "first_time",
        },
      });
      expect(response.status).toBe(201);
      // The documented mixed case: 0.35 + 0.25 + 0.175 + 0.06 = 0.835.
      expect(response.body.confidenceWeight).toBeCloseTo(0.835, 4);
    });

    it("logs a game against a teammate (both pilots + team decks)", async () => {
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        sideB: { pilotUserId: memberA2.id, deckId: deckA2.id },
      });
      expect(response.status).toBe(201);
      expect(response.body.sideB.pilotUserId).toBe(memberA2.id);
      expect(response.body.sideB.deckId).toBe(deckA2.id);
    });

    it("logs a game against a reference deck opponent", async () => {
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        sideB: { externalOpponentName: "Some Pro", deckId: referenceDeckA.id },
      });
      expect(response.status).toBe(201);
      expect(response.body.sideB.deckId).toBe(referenceDeckA.id);
    });

    it("rejects a result inconsistent with best-of (400 at the schema boundary)", async () => {
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        bestOf: 3,
        result: { gamesWonA: 3, gamesWonB: 0 },
      });
      expect(response.status).toBe(400);
    });

    it("rejects a sideB with no opponent identifier (400 at the schema boundary)", async () => {
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        sideB: {},
      });
      expect(response.status).toBe(400);
    });

    it("rejects a format from another game (cross-game FK)", async () => {
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        formatId: riftFormatId,
      });
      expect(response.status).toBe(404);
    });

    it("rejects an opponent hero from another game (cross-game FK)", async () => {
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        sideB: { heroId: riftHeroId },
      });
      expect(response.status).toBe(404);
    });

    it("rejects a non-reference deck as an external opponent (422)", async () => {
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        sideB: { externalOpponentName: "Rando", deckId: deckA.id },
      });
      expect(response.status).toBe(422);
    });

    it("rejects our deck belonging to another team (cross-team FK, 422)", async () => {
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        sideA: { pilotUserId: memberA.id, deckId: deckB.id },
      });
      expect(response.status).toBe(422);
    });

    it("rejects an event belonging to another team (cross-team FK, 422)", async () => {
      const eventB = await createEvent(prisma, { teamId: teamB.id, formatId: fabFormatId });
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        eventId: eventB.id,
      });
      expect(response.status).toBe(422);
    });

    it("requires authentication (401)", async () => {
      const response = await http()
        .post("/api/game-logs")
        .set("x-team-id", teamA.id)
        .send(validGame());
      expect(response.status).toBe(401);
    });

    it("rejects a forged team the member does not belong to (403)", async () => {
      const response = await http()
        .post("/api/game-logs")
        .set("x-test-user-id", memberA.id)
        .set("x-team-id", teamB.id)
        .send(validGame());
      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/game-logs", () => {
    it("lists only the team's logs and filters by deck, hero, pilot, and event", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id, formatId: fabFormatId });
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA.id,
        formatId: fabFormatId,
        pilotUserId: memberA.id,
        deckId: deckA.id,
        heroId: fabHeroId,
        eventId: event.id,
      });
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA2.id,
        formatId: fabFormatId,
        pilotUserId: memberA2.id,
        deckId: deckA2.id,
        archetypeLabel: "Control",
      });
      // A team-B log must never appear.
      await createGameLog(prisma, {
        teamId: teamB.id,
        loggedById: memberB.id,
        formatId: fabFormatId,
        pilotUserId: memberB.id,
        deckId: deckB.id,
      });

      const all = await asMemberA(http().get("/api/game-logs"));
      expect(all.status).toBe(200);
      expect(all.body.data).toHaveLength(2);

      const byDeck = await asMemberA(http().get(`/api/game-logs?deckId=${deckA.id}`));
      expect(byDeck.body.data).toHaveLength(1);

      const byHero = await asMemberA(http().get(`/api/game-logs?heroId=${fabHeroId}`));
      expect(byHero.body.data).toHaveLength(1);

      const byPilot = await asMemberA(http().get(`/api/game-logs?pilotUserId=${memberA2.id}`));
      expect(byPilot.body.data).toHaveLength(1);

      const byEvent = await asMemberA(http().get(`/api/game-logs?eventId=${event.id}`));
      expect(byEvent.body.data).toHaveLength(1);
    });
  });

  describe("GET /api/game-logs/:id", () => {
    it("returns 404 for another team's log (no enumeration)", async () => {
      const logB = await createGameLog(prisma, {
        teamId: teamB.id,
        loggedById: memberB.id,
        formatId: fabFormatId,
        pilotUserId: memberB.id,
        deckId: deckB.id,
      });
      const response = await asMemberA(http().get(`/api/game-logs/${logB.id}`));
      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/game-logs/:id", () => {
    it("re-derives the weight when a confidence factor changes", async () => {
      const created = await asMemberA(http().post("/api/game-logs")).send(validGame());
      expect(created.body.confidenceWeight).toBeCloseTo(1, 4);

      const updated = await asMemberA(http().patch(`/api/game-logs/${created.body.id}`)).send({
        confidenceFactors: { skillParity: "major_gap" },
      });
      expect(updated.status).toBe(200);
      // 0.35*0.4 + 0.25 + 0.25 + 0.15 = 0.79.
      expect(updated.body.confidenceWeight).toBeCloseTo(0.79, 4);
    });

    it("rejects an edit whose new result is inconsistent with the stored best-of (422)", async () => {
      const created = await asMemberA(http().post("/api/game-logs")).send(validGame());
      const response = await asMemberA(http().patch(`/api/game-logs/${created.body.id}`)).send({
        result: { gamesWonA: 3, gamesWonB: 3 },
      });
      expect(response.status).toBe(422);
    });

    it("lets a team-admin edit another member's log", async () => {
      const created = await asMemberA(http().post("/api/game-logs")).send(validGame());
      const response = await asAdminA(http().patch(`/api/game-logs/${created.body.id}`)).send({
        learnings: "Admin note.",
      });
      expect(response.status).toBe(200);
      expect(response.body.learnings).toBe("Admin note.");
    });

    it("forbids a non-admin editing another member's log (403)", async () => {
      const created = await asMemberA(http().post("/api/game-logs")).send(validGame());
      const response = await asMemberA2(http().patch(`/api/game-logs/${created.body.id}`)).send({
        learnings: "Not mine to edit.",
      });
      expect(response.status).toBe(403);
    });

    it("returns 404 (not 403) when editing another team's log", async () => {
      const created = await asMemberA(http().post("/api/game-logs")).send(validGame());
      const response = await asMemberB(http().patch(`/api/game-logs/${created.body.id}`)).send({
        learnings: "Cross-tenant edit.",
      });
      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/game-logs/:id", () => {
    it("soft-deletes a log (excluded from the list, retained in the DB)", async () => {
      const created = await asMemberA(http().post("/api/game-logs")).send(validGame());
      const del = await asMemberA(http().delete(`/api/game-logs/${created.body.id}`));
      expect(del.status).toBe(204);

      const list = await asMemberA(http().get("/api/game-logs"));
      expect(list.body.data).toHaveLength(0);
      const persisted = await prisma.gameLog.findUnique({ where: { id: created.body.id } });
      expect(persisted?.archivedAt).not.toBeNull();
    });
  });

  describe("aggregation feed", () => {
    it("produces the raw N and Σ weights per (hero, format) grouping for phase-07", async () => {
      // Three non-archived logs vs Dorinthea in CC with distinct weights, plus one
      // archived (must be excluded) and one vs a different opponent.
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA.id,
        formatId: fabFormatId,
        pilotUserId: memberA.id,
        deckId: deckA.id,
        heroId: fabHeroId,
        confidenceWeight: 1,
      });
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA.id,
        formatId: fabFormatId,
        pilotUserId: memberA.id,
        deckId: deckA.id,
        heroId: fabHeroId,
        confidenceWeight: 0.79,
      });
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA.id,
        formatId: fabFormatId,
        pilotUserId: memberA.id,
        deckId: deckA.id,
        heroId: fabHeroId,
        confidenceWeight: 0.5,
      });
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA.id,
        formatId: fabFormatId,
        pilotUserId: memberA.id,
        deckId: deckA.id,
        heroId: fabHeroId,
        confidenceWeight: 1,
        archivedAt: new Date(),
      });

      const grouped = await prisma.gameLog.groupBy({
        by: ["heroId", "formatId"],
        where: { teamId: teamA.id, archivedAt: null, heroId: fabHeroId },
        _count: { _all: true },
        _sum: { confidenceWeight: true },
      });
      expect(grouped).toHaveLength(1);
      expect(grouped[0]?._count._all).toBe(3);
      expect(grouped[0]?._sum.confidenceWeight).toBeCloseTo(2.29, 4);
    });
  });
});
