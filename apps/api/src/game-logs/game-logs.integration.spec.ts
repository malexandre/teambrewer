import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import {
  addMembership,
  createDeck,
  createFormat,
  createGame,
  createGameLog,
  createHero,
  createMeta,
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
 * team's deck/meta), the result/best-of and opponent-identity rules, logger/admin
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
  let opponentTeamDeckA: TestDeck;
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
    opponentTeamDeckA = await createDeck(prisma, {
      teamId: teamA.id,
      ownerId: adminA.id,
      formatId: fabFormatId,
      name: "Opponent Team Deck",
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
    sideA: { deckId: deckA.id },
    sideB: { heroId: fabHeroId, archetypeLabel: "Draconic Dorinthea" },
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

    it("logs a game against a teammate's team deck (player category + team deck)", async () => {
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        sideB: { playerCategory: "teammate", deckId: deckA2.id },
      });
      expect(response.status).toBe(201);
      expect(response.body.sideB.playerCategory).toBe("teammate");
      expect(response.body.sideB.deckId).toBe(deckA2.id);
    });

    it("logs a game against a circuit player on any team deck", async () => {
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        sideB: { playerCategory: "circuit_player", deckId: opponentTeamDeckA.id },
      });
      expect(response.status).toBe(201);
      expect(response.body.sideB.playerCategory).toBe("circuit_player");
      expect(response.body.sideB.deckId).toBe(opponentTeamDeckA.id);
    });

    it("defaults the player category per side (self → teammate, opponent → other)", async () => {
      const response = await asMemberA(http().post("/api/game-logs")).send(validGame());
      expect(response.status).toBe(201);
      expect(response.body.sideA.playerCategory).toBe("teammate");
      expect(response.body.sideB.playerCategory).toBe("other");
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
        sideB: { heroId: riftHeroId, archetypeLabel: "Rift Deck" },
      });
      expect(response.status).toBe(404);
    });

    it("rejects an opponent deck belonging to another team (cross-team FK, 422)", async () => {
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        sideB: { deckId: deckB.id },
      });
      expect(response.status).toBe(422);
    });

    it("rejects our deck belonging to another team (cross-team FK, 422)", async () => {
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        sideA: { deckId: deckB.id },
      });
      expect(response.status).toBe(422);
    });

    it("rejects a supplied meta belonging to another team (cross-team, 404)", async () => {
      const metaB = await createMeta(prisma, { teamId: teamB.id });
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        metaId: metaB.id,
      });
      expect(response.status).toBe(404);
    });

    it("auto-suggests the most recent meta of the log's format when metaId is omitted", async () => {
      // Two metas of the log's format (fabFormatId): the newer (max startDate) wins.
      // A later-starting meta of ANOTHER format must not be chosen.
      await createMeta(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        startDate: new Date("2020-01-01T00:00:00.000Z"),
        endDate: new Date("2020-02-01T00:00:00.000Z"),
      });
      const newerMeta = await createMeta(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-07-31T00:00:00.000Z"),
      });
      const blitz = await createFormat(prisma, {
        gameId: "flesh-and-blood",
        key: "blitz",
        name: "Blitz",
        isConstructed: false,
      });
      await createMeta(prisma, {
        teamId: teamA.id,
        formatId: blitz.id,
        startDate: new Date("2030-01-01T00:00:00.000Z"),
        endDate: new Date("2030-02-01T00:00:00.000Z"),
      });
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        playedAt: "2026-07-15",
      });
      expect(response.status).toBe(201);
      expect(response.body.metaId).toBe(newerMeta.id);
    });

    it("records no meta when metaId is null even if the format has a meta", async () => {
      await createMeta(prisma, { teamId: teamA.id, formatId: fabFormatId });
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        playedAt: "2026-07-15",
        metaId: null,
      });
      expect(response.status).toBe(201);
      expect(response.body.metaId).toBeNull();
    });

    it("auto-suggests null when the log's format has no meta", async () => {
      // Only a meta of a DIFFERENT format exists → the log's format has none.
      const blitz = await createFormat(prisma, {
        gameId: "flesh-and-blood",
        key: "blitz",
        name: "Blitz",
        isConstructed: false,
      });
      await createMeta(prisma, { teamId: teamA.id, formatId: blitz.id });
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        playedAt: "2026-07-15",
      });
      expect(response.status).toBe(201);
      expect(response.body.metaId).toBeNull();
    });

    it("persists impressive/underperforming cards with role and side", async () => {
      const card = await prisma.card.create({
        data: {
          gameId: "flesh-and-blood",
          externalId: "c-boost",
          name: "Command and Conquer",
          pitch: 1,
        },
      });
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        impressiveCards: [{ cardId: card.id, side: "ours" }],
        underperformingCards: [{ cardId: card.id, side: "theirs" }],
      });
      expect(response.status).toBe(201);
      expect(response.body.impressiveCards).toEqual([
        expect.objectContaining({ side: "ours", card: expect.objectContaining({ id: card.id }) }),
      ]);
      expect(response.body.underperformingCards).toEqual([
        expect.objectContaining({ side: "theirs", card: expect.objectContaining({ id: card.id }) }),
      ]);
    });

    it("rejects a captured card from another game (422)", async () => {
      const riftCard = await prisma.card.create({
        data: { gameId: "riftbound", externalId: "c-rift", name: "Rift Bolt", pitch: null },
      });
      const response = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        impressiveCards: [{ cardId: riftCard.id, side: "ours" }],
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
    it("lists only the team's logs and filters by deck, hero, and meta", async () => {
      const meta = await createMeta(prisma, { teamId: teamA.id });
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA.id,
        formatId: fabFormatId,
        deckId: deckA.id,
        opponentHeroId: fabHeroId,
        opponentArchetypeLabel: "Draconic Dorinthea",
        metaId: meta.id,
      });
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA2.id,
        formatId: fabFormatId,
        deckId: deckA2.id,
        opponentArchetypeLabel: "Control",
      });
      // A team-B log must never appear.
      await createGameLog(prisma, {
        teamId: teamB.id,
        loggedById: memberB.id,
        formatId: fabFormatId,
        deckId: deckB.id,
      });

      const all = await asMemberA(http().get("/api/game-logs"));
      expect(all.status).toBe(200);
      expect(all.body.data).toHaveLength(2);

      const byDeck = await asMemberA(http().get(`/api/game-logs?deckId=${deckA.id}`));
      expect(byDeck.body.data).toHaveLength(1);

      const byHero = await asMemberA(http().get(`/api/game-logs?heroId=${fabHeroId}`));
      expect(byHero.body.data).toHaveLength(1);

      const byMeta = await asMemberA(http().get(`/api/game-logs?metaId=${meta.id}`));
      expect(byMeta.body.data).toHaveLength(1);
    });
  });

  describe("GET /api/game-logs/:id", () => {
    it("returns 404 for another team's log (no enumeration)", async () => {
      const logB = await createGameLog(prisma, {
        teamId: teamB.id,
        loggedById: memberB.id,
        formatId: fabFormatId,
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

    it("replaces the impressive-card set on update", async () => {
      const card1 = await prisma.card.create({
        data: { gameId: "flesh-and-blood", externalId: "c1", name: "Card One", pitch: 1 },
      });
      const card2 = await prisma.card.create({
        data: { gameId: "flesh-and-blood", externalId: "c2", name: "Card Two", pitch: 2 },
      });
      const created = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        impressiveCards: [{ cardId: card1.id, side: "ours" }],
      });
      const updated = await asMemberA(http().patch(`/api/game-logs/${created.body.id}`)).send({
        impressiveCards: [{ cardId: card2.id, side: "theirs" }],
      });
      expect(updated.status).toBe(200);
      expect(updated.body.impressiveCards).toEqual([
        expect.objectContaining({
          side: "theirs",
          card: expect.objectContaining({ id: card2.id }),
        }),
      ]);
    });

    it("rejects a cross-game card and does not commit the accompanying field edit (422, no partial write)", async () => {
      const created = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        learnings: "Original note.",
      });
      const riftCard = await prisma.card.create({
        data: { gameId: "riftbound", externalId: "c-rift-patch", name: "Rift Surge", pitch: null },
      });

      // A valid field edit plus a cross-game card: the card must reject with 422
      // before the field write, so the learnings stay at their original value.
      const response = await asMemberA(http().patch(`/api/game-logs/${created.body.id}`)).send({
        learnings: "Should not persist.",
        impressiveCards: [{ cardId: riftCard.id, side: "ours" }],
      });
      expect(response.status).toBe(422);

      const reread = await asMemberA(http().get(`/api/game-logs/${created.body.id}`));
      expect(reread.status).toBe(200);
      expect(reread.body.learnings).toBe("Original note.");
    });

    it("does not touch captured cards a team cannot see (tenant isolation)", async () => {
      const card = await prisma.card.create({
        data: { gameId: "flesh-and-blood", externalId: "c3", name: "Card Three", pitch: 1 },
      });
      const created = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        impressiveCards: [{ cardId: card.id, side: "ours" }],
      });
      // memberB (team B) cannot read or edit team A's log or its cards.
      const read = await asMemberB(http().get(`/api/game-logs/${created.body.id}`));
      expect(read.status).toBe(404);
    });

    it("blocks a cross-tenant PATCH carrying a card array (404, no card write)", async () => {
      const card = await prisma.card.create({
        data: {
          gameId: "flesh-and-blood",
          externalId: "c-cross",
          name: "Cross Tenant Card",
          pitch: 1,
        },
      });
      const created = await asMemberA(http().post("/api/game-logs")).send(validGame());

      // memberB (team B) hits team A's log with a card-array payload: the 404
      // must fire before the card-write path ever runs.
      const response = await asMemberB(http().patch(`/api/game-logs/${created.body.id}`)).send({
        impressiveCards: [{ cardId: card.id, side: "ours" }],
      });
      expect(response.status).toBe(404);

      const persistedCards = await prisma.gameLogCard.findMany({
        where: { gameLogId: created.body.id },
      });
      expect(persistedCards).toHaveLength(0);
    });

    it("replaces only the targeted role, leaving the other role's cards untouched", async () => {
      const cardA = await prisma.card.create({
        data: { gameId: "flesh-and-blood", externalId: "c-role-a", name: "Card A", pitch: 1 },
      });
      const cardB = await prisma.card.create({
        data: { gameId: "flesh-and-blood", externalId: "c-role-b", name: "Card B", pitch: 2 },
      });
      const cardC = await prisma.card.create({
        data: { gameId: "flesh-and-blood", externalId: "c-role-c", name: "Card C", pitch: 3 },
      });
      const created = await asMemberA(http().post("/api/game-logs")).send({
        ...validGame(),
        impressiveCards: [{ cardId: cardA.id, side: "ours" }],
        underperformingCards: [{ cardId: cardB.id, side: "theirs" }],
      });

      // Only underperformingCards is sent; impressiveCards is omitted entirely.
      const updated = await asMemberA(http().patch(`/api/game-logs/${created.body.id}`)).send({
        underperformingCards: [{ cardId: cardC.id, side: "ours" }],
      });

      expect(updated.status).toBe(200);
      expect(updated.body.underperformingCards).toEqual([
        expect.objectContaining({ side: "ours", card: expect.objectContaining({ id: cardC.id }) }),
      ]);
      // impressiveCards must be exactly what was created, untouched by the update.
      expect(updated.body.impressiveCards).toEqual([
        expect.objectContaining({ side: "ours", card: expect.objectContaining({ id: cardA.id }) }),
      ]);
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
        deckId: deckA.id,
        opponentHeroId: fabHeroId,
        opponentArchetypeLabel: "Draconic Dorinthea",
        confidenceWeight: 1,
      });
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA.id,
        formatId: fabFormatId,
        deckId: deckA.id,
        opponentHeroId: fabHeroId,
        opponentArchetypeLabel: "Draconic Dorinthea",
        confidenceWeight: 0.79,
      });
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA.id,
        formatId: fabFormatId,
        deckId: deckA.id,
        opponentHeroId: fabHeroId,
        opponentArchetypeLabel: "Draconic Dorinthea",
        confidenceWeight: 0.5,
      });
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA.id,
        formatId: fabFormatId,
        deckId: deckA.id,
        opponentHeroId: fabHeroId,
        opponentArchetypeLabel: "Draconic Dorinthea",
        confidenceWeight: 1,
        archivedAt: new Date(),
      });

      const grouped = await prisma.gameLog.groupBy({
        by: ["opponentHeroId", "formatId"],
        where: { teamId: teamA.id, archivedAt: null, opponentHeroId: fabHeroId },
        _count: { _all: true },
        _sum: { confidenceWeight: true },
      });
      expect(grouped).toHaveLength(1);
      expect(grouped[0]?._count._all).toBe(3);
      expect(grouped[0]?._sum.confidenceWeight).toBeCloseTo(2.29, 4);
    });
  });
});
