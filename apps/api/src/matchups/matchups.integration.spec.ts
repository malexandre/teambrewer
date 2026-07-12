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
  createGauntletEntry,
  createHero,
  createTeam,
  createTestPrismaClient,
  createUser,
  type TestDeck,
  type TestEvent,
  type TestTeam,
  type TestUser,
} from "../../test/factories.js";
import { createApiTestApp } from "../../test/nest-app.js";
import { AppModule } from "../app.module.js";
import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Endpoint tests for matchup aggregation & coverage (phase-07). The critical
 * properties: the confidence-weighted numbers match crafted datasets exactly
 * (raw N, effective sample, weighted win rate, trust bucket); draws are excluded
 * from the rate + effective sample but counted in raw N; archived logs are never
 * counted; by-deck vs by-hero partition correctly; coverage flags thin gauntlet
 * matchups ordered by normalized field share; and tenant isolation holds (a team
 * never reaches another team's logs; forged team → 403; cross-tenant id → 404).
 */
describe("Matchup endpoints (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let teamA: TestTeam;
  let teamB: TestTeam;
  let adminA: TestUser;
  let memberA: TestUser;
  let memberB: TestUser;

  let fabFormatId: string;
  let fabFormatOtherId: string;
  let heroDorintheaId: string;
  let heroKanoId: string;
  let heroFangId: string;

  let deckDoriOne: TestDeck;
  let deckDoriTwo: TestDeck;
  let referenceFang: TestDeck;
  let deckB: TestDeck;

  let eventA: TestEvent;
  let eventB: TestEvent;
  let gauntletFang: { id: string };
  let gauntletKano: { id: string };
  let gauntletAggro: { id: string };

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
    memberB = await createUser(prisma, { username: "member_b" });
    await addMembership(prisma, { teamId: teamA.id, userId: adminA.id, role: "team_admin" });
    await addMembership(prisma, { teamId: teamA.id, userId: memberA.id, role: "member" });
    await addMembership(prisma, { teamId: teamB.id, userId: memberB.id, role: "member" });

    fabFormatId = (
      await createFormat(prisma, {
        gameId: "flesh-and-blood",
        key: "cc",
        name: "Classic Constructed",
      })
    ).id;
    fabFormatOtherId = (
      await createFormat(prisma, { gameId: "flesh-and-blood", key: "blitz", name: "Blitz" })
    ).id;
    heroDorintheaId = (await createHero(prisma, { gameId: "flesh-and-blood", name: "Dorinthea" }))
      .id;
    heroKanoId = (await createHero(prisma, { gameId: "flesh-and-blood", name: "Kano" })).id;
    heroFangId = (await createHero(prisma, { gameId: "flesh-and-blood", name: "Fang" })).id;

    // Our two decks share a hero (Dorinthea) so by-hero groups them; by-deck keeps
    // them apart.
    deckDoriOne = await createDeck(prisma, {
      teamId: teamA.id,
      ownerId: memberA.id,
      formatId: fabFormatId,
      heroId: heroDorintheaId,
      name: "Dori One",
    });
    deckDoriTwo = await createDeck(prisma, {
      teamId: teamA.id,
      ownerId: memberA.id,
      formatId: fabFormatId,
      heroId: heroDorintheaId,
      name: "Dori Two",
    });
    referenceFang = await createDeck(prisma, {
      teamId: teamA.id,
      ownerId: adminA.id,
      formatId: fabFormatId,
      heroId: heroFangId,
      name: "Fang Reference",
      isReference: true,
    });
    deckB = await createDeck(prisma, {
      teamId: teamB.id,
      ownerId: memberB.id,
      formatId: fabFormatId,
      heroId: heroKanoId,
      name: "Team B Deck",
    });

    eventA = await createEvent(prisma, {
      teamId: teamA.id,
      formatId: fabFormatId,
      name: "Battle Hardened",
    });
    eventB = await createEvent(prisma, {
      teamId: teamB.id,
      formatId: fabFormatId,
      name: "Rival Event",
    });
    gauntletFang = await createGauntletEntry(prisma, {
      eventId: eventA.id,
      teamId: teamA.id,
      referenceDeckId: referenceFang.id,
      expectedMetaShare: 50,
    });
    gauntletKano = await createGauntletEntry(prisma, {
      eventId: eventA.id,
      teamId: teamA.id,
      heroId: heroKanoId,
      expectedMetaShare: 30,
    });
    gauntletAggro = await createGauntletEntry(prisma, {
      eventId: eventA.id,
      teamId: teamA.id,
      archetypeLabel: "Aggro Red",
      expectedMetaShare: 20,
    });

    // Matchup: Dori One vs opponent Kano — the plan's crafted dataset.
    // weights [1.0, 1.0, 0.5, 0.5, 0.2], wins [W, L, W, L, W] (Bo1).
    const doriOneVsKano: [number, number, number][] = [
      [1, 0, 1.0],
      [0, 1, 1.0],
      [1, 0, 0.5],
      [0, 1, 0.5],
      [1, 0, 0.2],
    ];
    for (const [gamesWonA, gamesWonB, confidenceWeight] of doriOneVsKano) {
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA.id,
        formatId: fabFormatId,
        pilotUserId: memberA.id,
        deckId: deckDoriOne.id,
        heroId: heroKanoId,
        bestOf: 1,
        gamesWonA,
        gamesWonB,
        confidenceWeight,
      });
    }
    // An archived log in the same matchup must never be counted.
    await createGameLog(prisma, {
      teamId: teamA.id,
      loggedById: memberA.id,
      formatId: fabFormatId,
      pilotUserId: memberA.id,
      deckId: deckDoriOne.id,
      heroId: heroKanoId,
      bestOf: 1,
      gamesWonA: 1,
      gamesWonB: 0,
      confidenceWeight: 5,
      archivedAt: new Date("2026-07-05T00:00:00.000Z"),
    });
    // A draw in the same matchup: counted in raw N, excluded from rate + effective.
    await createGameLog(prisma, {
      teamId: teamA.id,
      loggedById: memberA.id,
      formatId: fabFormatId,
      pilotUserId: memberA.id,
      deckId: deckDoriOne.id,
      heroId: heroKanoId,
      bestOf: 1,
      gamesWonA: 0,
      gamesWonB: 0,
      confidenceWeight: 1.0,
    });

    // Matchup: Dori Two vs opponent Kano — one win, weight 1.0 (by-hero combines
    // it with Dori One's five; by-deck keeps it separate).
    await createGameLog(prisma, {
      teamId: teamA.id,
      loggedById: memberA.id,
      formatId: fabFormatId,
      pilotUserId: memberA.id,
      deckId: deckDoriTwo.id,
      heroId: heroKanoId,
      bestOf: 1,
      gamesWonA: 1,
      gamesWonB: 0,
      confidenceWeight: 1.0,
    });

    // Matchup: Dori One vs the Fang reference deck (a gauntlet target) — two wins.
    for (let index = 0; index < 2; index += 1) {
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA.id,
        formatId: fabFormatId,
        pilotUserId: memberA.id,
        deckId: deckDoriOne.id,
        opponentDeckId: referenceFang.id,
        bestOf: 1,
        gamesWonA: 1,
        gamesWonB: 0,
        confidenceWeight: 1.0,
      });
    }

    // A log in a different format must never bleed into fabFormatId results.
    await createGameLog(prisma, {
      teamId: teamA.id,
      loggedById: memberA.id,
      formatId: fabFormatOtherId,
      pilotUserId: memberA.id,
      deckId: deckDoriOne.id,
      heroId: heroKanoId,
      bestOf: 1,
      gamesWonA: 1,
      gamesWonB: 0,
      confidenceWeight: 1.0,
    });

    // Team B's own log — used to prove isolation (team B sees only this).
    await createGameLog(prisma, {
      teamId: teamB.id,
      loggedById: memberB.id,
      formatId: fabFormatId,
      pilotUserId: memberB.id,
      deckId: deckB.id,
      heroId: heroDorintheaId,
      bestOf: 1,
      gamesWonA: 1,
      gamesWonB: 0,
      confidenceWeight: 1.0,
    });
  });

  const http = () => request(app.getHttpServer());
  const asMemberA = (req: request.Test) =>
    req.set("x-test-user-id", memberA.id).set("x-team-id", teamA.id);
  const asMemberB = (req: request.Test) =>
    req.set("x-test-user-id", memberB.id).set("x-team-id", teamB.id);

  describe("GET /api/matchups (by deck)", () => {
    it("computes the crafted Dori One vs Kano cell exactly, excluding the archived + draw from the rate", async () => {
      const response = await asMemberA(http().get(`/api/matchups?formatId=${fabFormatId}`));
      expect(response.status).toBe(200);
      expect(response.body.grouping).toBe("deck");

      const cell = findCell(response.body.data, deckDoriOne.id, heroKanoId);
      // 5 decisive games + 1 draw = raw N 6; effective sample = decisive weights
      // (3.2, the draw's 1.0 excluded); rate = 1.7 / 3.2.
      expect(cell.rawSampleCount).toBe(6);
      expect(cell.effectiveSample).toBeCloseTo(3.2, 4);
      expect(cell.weightedWinRate).toBeCloseTo(0.5313, 4);
      expect(cell.trustIndicator).toBe("low");
    });

    it("keeps our two Dorinthea decks separate by deck", async () => {
      const response = await asMemberA(http().get(`/api/matchups?formatId=${fabFormatId}`));
      const doriOne = findCell(response.body.data, deckDoriOne.id, heroKanoId);
      const doriTwo = findCell(response.body.data, deckDoriTwo.id, heroKanoId);
      expect(doriOne.rawSampleCount).toBe(6);
      expect(doriTwo.rawSampleCount).toBe(1);
    });

    it("excludes games from another format", async () => {
      const response = await asMemberA(http().get(`/api/matchups?formatId=${fabFormatOtherId}`));
      // Only the single blitz log exists: Dori One vs Kano, N=1.
      const cell = findCell(response.body.data, deckDoriOne.id, heroKanoId);
      expect(cell.rawSampleCount).toBe(1);
    });

    it("narrows to a single our-deck with ourDeckId", async () => {
      const response = await asMemberA(
        http().get(`/api/matchups?formatId=${fabFormatId}&ourDeckId=${deckDoriTwo.id}`),
      );
      expect(response.status).toBe(200);
      for (const matchup of response.body.data) {
        expect(matchup.our.deckId).toBe(deckDoriTwo.id);
      }
    });
  });

  describe("GET /api/matchups?byHero=true", () => {
    it("combines both Dorinthea decks into one hero row vs Kano", async () => {
      const response = await asMemberA(
        http().get(`/api/matchups?formatId=${fabFormatId}&byHero=true`),
      );
      expect(response.status).toBe(200);
      expect(response.body.grouping).toBe("hero");

      const cell = findHeroCell(response.body.data, heroDorintheaId, heroKanoId);
      // Dori One's 5 decisive + 1 draw (N=6) plus Dori Two's 1 win (N=1) = N=7;
      // decisive weight 3.2 + 1.0 = 4.2; win weight 1.7 + 1.0 = 2.7.
      expect(cell.rawSampleCount).toBe(7);
      expect(cell.effectiveSample).toBeCloseTo(4.2, 4);
      expect(cell.weightedWinRate).toBeCloseTo(0.6429, 4);
    });
  });

  describe("GET /api/matchups/matrix", () => {
    it("returns our-deck rows and includes every gauntlet target as a column, even untested ones", async () => {
      const response = await asMemberA(
        http().get(`/api/matchups/matrix?formatId=${fabFormatId}&eventId=${eventA.id}`),
      );
      expect(response.status).toBe(200);

      const columnKeys = response.body.columns.map((column: { key: string }) => column.key);
      expect(columnKeys).toContain(`deck:${referenceFang.id}`);
      expect(columnKeys).toContain(`hero:${heroKanoId}`);
      expect(columnKeys).toContain("archetype:aggro red");
      // The untested Aggro Red target has a column but no cell.
      const aggroCells = response.body.cells.filter(
        (cell: { columnKey: string }) => cell.columnKey === "archetype:aggro red",
      );
      expect(aggroCells).toHaveLength(0);
    });
  });

  describe("GET /api/matchups/coverage", () => {
    it("orders gauntlet targets by normalized field share and flags thin matchups", async () => {
      const response = await asMemberA(http().get(`/api/matchups/coverage?eventId=${eventA.id}`));
      expect(response.status).toBe(200);
      expect(
        response.body.rows.map((row: { gauntletEntryId: string }) => row.gauntletEntryId),
      ).toEqual([gauntletFang.id, gauntletKano.id, gauntletAggro.id]);

      const [fang, kano, aggro] = response.body.rows;
      expect(fang.normalizedShare).toBeCloseTo(0.5, 4);
      expect(fang.aggregate.effectiveSample).toBeCloseTo(2.0, 4);
      expect(fang.isUnderCovered).toBe(true);

      expect(kano.normalizedShare).toBeCloseTo(0.3, 4);
      // By deck, Kano is faced by both our decks: effective 3.2 + 1.0 = 4.2.
      expect(kano.aggregate.effectiveSample).toBeCloseTo(4.2, 4);
      expect(kano.candidates).toHaveLength(2);

      // Aggro Red is completely untested.
      expect(aggro.aggregate.rawSampleCount).toBe(0);
      expect(aggro.aggregate.weightedWinRate).toBeNull();
      expect(aggro.isUnderCovered).toBe(true);
    });

    it("respects a lower minEffectiveSample threshold", async () => {
      const response = await asMemberA(
        http().get(`/api/matchups/coverage?eventId=${eventA.id}&minEffectiveSample=2`),
      );
      const kano = response.body.rows.find(
        (row: { gauntletEntryId: string }) => row.gauntletEntryId === gauntletKano.id,
      );
      // Kano's effective sample (4.2) now clears the threshold of 2.
      expect(kano.isUnderCovered).toBe(false);
    });
  });

  describe("tenant isolation", () => {
    it("never includes another team's logs (team B sees only its own matchup)", async () => {
      const response = await asMemberB(http().get(`/api/matchups?formatId=${fabFormatId}`));
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].our.deckId).toBe(deckB.id);
    });

    it("requires authentication (401)", async () => {
      const response = await http()
        .get(`/api/matchups?formatId=${fabFormatId}`)
        .set("x-team-id", teamA.id);
      expect(response.status).toBe(401);
    });

    it("rejects a forged team the member does not belong to (403)", async () => {
      const response = await http()
        .get(`/api/matchups?formatId=${fabFormatId}`)
        .set("x-test-user-id", memberA.id)
        .set("x-team-id", teamB.id);
      expect(response.status).toBe(403);
    });

    it("returns 404 for a cross-tenant eventId in coverage (no enumeration)", async () => {
      const response = await asMemberA(http().get(`/api/matchups/coverage?eventId=${eventB.id}`));
      expect(response.status).toBe(404);
    });

    it("returns 404 for a cross-tenant ourDeckId", async () => {
      const response = await asMemberA(
        http().get(`/api/matchups?formatId=${fabFormatId}&ourDeckId=${deckB.id}`),
      );
      expect(response.status).toBe(404);
    });
  });
});

interface ListMatchup {
  our: { deckId: string | null; heroId: string | null };
  opponent: { deckId: string | null; heroId: string | null };
  cell: {
    rawSampleCount: number;
    effectiveSample: number;
    weightedWinRate: number | null;
    trustIndicator: string;
  };
}

function findCell(data: ListMatchup[], ourDeckId: string, opponentHeroId: string) {
  const match = data.find(
    (matchup) => matchup.our.deckId === ourDeckId && matchup.opponent.heroId === opponentHeroId,
  );
  if (!match) throw new Error(`No matchup for deck ${ourDeckId} vs hero ${opponentHeroId}`);
  return match.cell;
}

function findHeroCell(data: ListMatchup[], ourHeroId: string, opponentHeroId: string) {
  const match = data.find(
    (matchup) => matchup.our.heroId === ourHeroId && matchup.opponent.heroId === opponentHeroId,
  );
  if (!match) throw new Error(`No matchup for hero ${ourHeroId} vs hero ${opponentHeroId}`);
  return match.cell;
}
