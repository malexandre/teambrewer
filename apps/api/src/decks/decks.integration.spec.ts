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
  createMatchupGamePlan,
  createMeta,
  createMetaDeckEntry,
  createTeam,
  createTestPrismaClient,
  createUser,
  type TestTeam,
  type TestUser,
} from "../../test/factories.js";
import { createApiTestApp } from "../../test/nest-app.js";
import { AppModule } from "../app.module.js";
import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Endpoint tests for decks. The critical properties are tenant isolation (a team
 * never reaches another team's decks) and the ownership/visibility rules on top
 * of it. A two-team Flesh and Blood world plus a Riftbound game (for cross-game
 * FK rejection) backs the suite.
 */
describe("Decks endpoints (integration)", () => {
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

  const fabrikaryUrl = "https://fabrary.net/decks/abc123";

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
  });

  const http = () => request(app.getHttpServer());
  const asMemberA = (req: request.Test) =>
    req.set("x-test-user-id", memberA.id).set("x-team-id", teamA.id);
  const asMemberA2 = (req: request.Test) =>
    req.set("x-test-user-id", memberA2.id).set("x-team-id", teamA.id);
  const asAdminA = (req: request.Test) =>
    req.set("x-test-user-id", adminA.id).set("x-team-id", teamA.id);

  const validBody = () => ({
    name: "Aggro Dori",
    formatId: fabFormatId,
    externalUrl: fabrikaryUrl,
  });

  describe("POST /api/decks", () => {
    it("creates a deck, stamping teamId/gameId/ownerId server-side and recognizing the link", async () => {
      const response = await asMemberA(http().post("/api/decks")).send({
        ...validBody(),
        heroId: fabHeroId,
        // A spoofed teamId/ownerId in the body must be ignored.
        teamId: teamB.id,
        ownerId: memberB.id,
      });
      expect(response.status).toBe(201);
      expect(response.body.status).toBe("exploratory");
      expect(response.body.source).toBe("fabrary");
      expect(response.body.ownerId).toBe(memberA.id);
      expect(response.body.gameId).toBe("flesh-and-blood");

      const persisted = await prisma.deck.findUnique({ where: { id: response.body.id } });
      expect(persisted?.teamId).toBe(teamA.id);
      expect(persisted?.ownerId).toBe(memberA.id);
    });

    it("labels an unrecognized link with a generic source", async () => {
      const response = await asMemberA(http().post("/api/decks")).send({
        ...validBody(),
        externalUrl: "https://example.com/my-list",
      });
      expect(response.status).toBe(201);
      expect(response.body.source).toBe("other");
    });

    it("rejects an invalid externalUrl (400)", async () => {
      const response = await asMemberA(http().post("/api/decks")).send({
        ...validBody(),
        externalUrl: "not a url",
      });
      expect(response.status).toBe(400);
    });

    it("rejects a format from another game (cross-game FK → 404)", async () => {
      const response = await asMemberA(http().post("/api/decks")).send({
        ...validBody(),
        formatId: riftFormatId,
      });
      expect(response.status).toBe(404);
    });

    it("rejects a hero from another game (cross-game FK → 404)", async () => {
      const response = await asMemberA(http().post("/api/decks")).send({
        ...validBody(),
        heroId: riftHeroId,
      });
      expect(response.status).toBe(404);
    });
  });

  describe("Meta linking (DeckMeta)", () => {
    // The default now links the most recent meta (max startDate) of the DECK's format.
    // The deck under test uses fabFormatId; a separate FaB format proves discrimination.
    const newerWindow = {
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-08-01T00:00:00.000Z"),
    };
    const olderWindow = {
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      endDate: new Date("2020-02-01T00:00:00.000Z"),
    };
    const createBlitzFormat = () =>
      createFormat(prisma, {
        gameId: "flesh-and-blood",
        key: "blitz",
        name: "Blitz",
        isConstructed: false,
      });

    it("links the most recent meta of the deck's format by default when metaIds is omitted", async () => {
      // Older + newer metas of the deck's format, plus a meta of another format that
      // must NOT be chosen even though it starts later.
      await createMeta(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        name: "Old",
        ...olderWindow,
      });
      const newer = await createMeta(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        name: "Now",
        ...newerWindow,
      });
      const blitz = await createBlitzFormat();
      await createMeta(prisma, {
        teamId: teamA.id,
        formatId: blitz.id,
        name: "Blitz meta",
        startDate: new Date("2030-01-01T00:00:00.000Z"),
        endDate: new Date("2030-02-01T00:00:00.000Z"),
      });

      const response = await asMemberA(http().post("/api/decks")).send(validBody());
      expect(response.status).toBe(201);
      expect(response.body.linkedMetas).toEqual([{ id: newer.id, name: "Now" }]);
    });

    it("links nothing when the deck's format has no meta and metaIds is omitted", async () => {
      // Only a meta of a DIFFERENT format exists → the deck's format has none.
      const blitz = await createBlitzFormat();
      await createMeta(prisma, { teamId: teamA.id, formatId: blitz.id, name: "Blitz meta" });
      const response = await asMemberA(http().post("/api/decks")).send(validBody());
      expect(response.status).toBe(201);
      expect(response.body.linkedMetas).toEqual([]);
    });

    it("overrides the default with an explicit metaIds set", async () => {
      await createMeta(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        name: "Now",
        ...newerWindow,
      });
      const other = await createMeta(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        name: "Other",
        ...olderWindow,
      });
      const response = await asMemberA(http().post("/api/decks")).send({
        ...validBody(),
        metaIds: [other.id],
      });
      expect(response.status).toBe(201);
      expect(response.body.linkedMetas).toEqual([{ id: other.id, name: "Other" }]);
    });

    it("links nothing when metaIds is an explicit empty array", async () => {
      await createMeta(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        name: "Now",
        ...newerWindow,
      });
      const response = await asMemberA(http().post("/api/decks")).send({
        ...validBody(),
        metaIds: [],
      });
      expect(response.status).toBe(201);
      expect(response.body.linkedMetas).toEqual([]);
    });

    it("replaces the linked metas on update", async () => {
      const first = await createMeta(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        name: "First",
        ...newerWindow,
      });
      const second = await createMeta(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        name: "Second",
        ...olderWindow,
      });
      const created = await asMemberA(http().post("/api/decks")).send({
        ...validBody(),
        metaIds: [first.id],
      });
      const updated = await asMemberA(http().patch(`/api/decks/${created.body.id}`)).send({
        metaIds: [second.id],
      });
      expect(updated.status).toBe(200);
      expect(updated.body.linkedMetas).toEqual([{ id: second.id, name: "Second" }]);
    });

    it("rejects a meta from another team (cross-team FK → 422)", async () => {
      const foreign = await createMeta(prisma, { teamId: teamB.id, name: "B-meta" });
      const response = await asMemberA(http().post("/api/decks")).send({
        ...validBody(),
        metaIds: [foreign.id],
      });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("DOMAIN_RULE_VIOLATION");
    });
  });

  describe("GET /api/decks", () => {
    it("lists only the active team's non-archived decks", async () => {
      await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
        name: "A-live",
      });
      await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
        name: "A-archived",
        archivedAt: new Date(),
      });
      await createDeck(prisma, {
        teamId: teamB.id,
        ownerId: memberB.id,
        formatId: fabFormatId,
        name: "B-secret",
      });

      const response = await asMemberA(http().get("/api/decks"));
      expect(response.status).toBe(200);
      const names = response.body.data.map((deck: { name: string }) => deck.name);
      expect(names).toContain("A-live");
      expect(names).not.toContain("A-archived");
      expect(names).not.toContain("B-secret");
    });

    it("filters by status and paginates with a keyset cursor", async () => {
      for (let index = 0; index < 3; index += 1) {
        await createDeck(prisma, {
          teamId: teamA.id,
          ownerId: memberA.id,
          formatId: fabFormatId,
          name: `Deck ${index}`,
          status: "testing",
        });
      }
      await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
        status: "retired",
      });

      const testing = await asMemberA(http().get("/api/decks").query({ status: "testing" }));
      expect(testing.body.data).toHaveLength(3);

      const first = await asMemberA(
        http().get("/api/decks").query({ status: "testing", limit: 2 }),
      );
      expect(first.body.data).toHaveLength(2);
      expect(first.body.nextCursor).not.toBeNull();
      const second = await asMemberA(
        http()
          .get("/api/decks")
          .query({ status: "testing", limit: 2, cursor: first.body.nextCursor }),
      );
      const firstIds = first.body.data.map((deck: { id: string }) => deck.id);
      const secondIds = second.body.data.map((deck: { id: string }) => deck.id);
      expect(firstIds.filter((id: string) => secondIds.includes(id))).toEqual([]);
    });
  });

  describe("Tenant isolation (mandatory)", () => {
    it("returns 404 for another team's deck by id", async () => {
      const bDeck = await createDeck(prisma, {
        teamId: teamB.id,
        ownerId: memberB.id,
        formatId: fabFormatId,
      });
      const response = await asMemberA(http().get(`/api/decks/${bDeck.id}`));
      expect(response.status).toBe(404);
    });

    it("rejects a forged X-Team-Id the caller is not a member of (403)", async () => {
      const response = await http()
        .get("/api/decks")
        .set("x-test-user-id", memberA.id)
        .set("x-team-id", teamB.id);
      expect(response.status).toBe(403);
    });

    it("cannot update, archive, change status, or annotate another team's deck (404)", async () => {
      const bDeck = await createDeck(prisma, {
        teamId: teamB.id,
        ownerId: memberB.id,
        formatId: fabFormatId,
      });
      const update = await asMemberA(http().patch(`/api/decks/${bDeck.id}`)).send({
        name: "hijacked",
      });
      const archive = await asMemberA(http().delete(`/api/decks/${bDeck.id}`));
      const status = await asMemberA(http().patch(`/api/decks/${bDeck.id}/status`)).send({
        status: "testing",
      });
      const iterate = await asMemberA(http().post(`/api/decks/${bDeck.id}/iteration-entries`)).send(
        { body: "x" },
      );
      expect([update.status, archive.status, status.status, iterate.status]).toEqual([
        404, 404, 404, 404,
      ]);

      const untouched = await prisma.deck.findUnique({ where: { id: bDeck.id } });
      expect(untouched?.name).toBe(bDeck.name);
      expect(untouched?.archivedAt).toBeNull();
    });
  });

  describe("Ownership & moderation", () => {
    it("lets a member edit their own deck", async () => {
      const deck = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
      });
      const response = await asMemberA(http().patch(`/api/decks/${deck.id}`)).send({
        name: "Renamed",
      });
      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Renamed");
    });

    it("forbids a member editing another member's team deck (403)", async () => {
      const deck = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: adminA.id,
        formatId: fabFormatId,
        visibility: "team",
      });
      const response = await asMemberA(http().patch(`/api/decks/${deck.id}`)).send({
        name: "nope",
      });
      expect(response.status).toBe(403);
    });

    it("lets a team-admin moderate any in-team deck", async () => {
      const deck = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
      });
      const edit = await asAdminA(http().patch(`/api/decks/${deck.id}`)).send({
        name: "Moderated",
      });
      expect(edit.status).toBe(200);
      const archive = await asAdminA(http().delete(`/api/decks/${deck.id}`));
      expect(archive.status).toBe(204);
    });
  });

  describe("Visibility", () => {
    it("hides a private draft from another member but shows it to the owner and team-admins", async () => {
      const draft = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
        visibility: "private",
        name: "Secret Tech",
      });

      const asOther = await asMemberA2(http().get(`/api/decks/${draft.id}`));
      expect(asOther.status).toBe(404);
      const otherList = await asMemberA2(http().get("/api/decks"));
      expect(otherList.body.data.map((deck: { name: string }) => deck.name)).not.toContain(
        "Secret Tech",
      );

      const asOwner = await asMemberA(http().get(`/api/decks/${draft.id}`));
      expect(asOwner.status).toBe(200);
      const asAdmin = await asAdminA(http().get(`/api/decks/${draft.id}`));
      expect(asAdmin.status).toBe(200);
    });
  });

  describe("Status lifecycle", () => {
    it("applies an allowed transition", async () => {
      const deck = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
        status: "exploratory",
      });
      const response = await asMemberA(http().patch(`/api/decks/${deck.id}/status`)).send({
        status: "testing",
      });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("testing");
    });

    it("rejects a disallowed transition (422)", async () => {
      const deck = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
        status: "retired",
      });
      const response = await asMemberA(http().patch(`/api/decks/${deck.id}/status`)).send({
        status: "exploratory",
      });
      expect(response.status).toBe(422);
    });

    it("rejects a status field on the general update route (400)", async () => {
      const deck = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
      });
      const response = await asMemberA(http().patch(`/api/decks/${deck.id}`)).send({
        status: "retired",
      });
      expect(response.status).toBe(400);
    });
  });

  describe("Iteration log", () => {
    it("appends author-attributed entries, listed most-recent first", async () => {
      const deck = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
      });
      await asMemberA(http().post(`/api/decks/${deck.id}/iteration-entries`)).send({
        body: "first change",
      });
      const second = await asMemberA(http().post(`/api/decks/${deck.id}/iteration-entries`)).send({
        body: "second change",
      });
      expect(second.status).toBe(201);
      expect(second.body.authorId).toBe(memberA.id);

      const list = await asMemberA(http().get(`/api/decks/${deck.id}/iteration-entries`));
      expect(list.body.data.map((entry: { body: string }) => entry.body)).toEqual([
        "second change",
        "first change",
      ]);
    });

    it("forbids a non-owner member from adding an entry (403)", async () => {
      const deck = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
        visibility: "team",
      });
      const response = await asMemberA2(
        http().post(`/api/decks/${deck.id}/iteration-entries`),
      ).send({ body: "sneaky" });
      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/decks/:deckId/meta-readiness", () => {
    it("computes the confidence-weighted read + plan presence for each meta deck entry", async () => {
      const ourDeck = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
        name: "Ours",
      });
      const meta = await createMeta(prisma, { teamId: teamA.id, name: "July" });
      const heroEntry = await createMetaDeckEntry(prisma, {
        metaId: meta.id,
        teamId: teamA.id,
        tier: "meta_defining",
        heroId: fabHeroId,
        label: "Dorinthea",
        opponentSnapshotLabel: "Dorinthea",
      });
      const archetypeEntry = await createMetaDeckEntry(prisma, {
        metaId: meta.id,
        teamId: teamA.id,
        tier: "contender",
        label: "Aggro Red",
        opponentSnapshotLabel: "Aggro Red",
      });

      // vs the hero: 2 wins, 1 loss, 1 draw — all weight 1. The draw counts only in
      // raw N (excluded from the rate + effective sample). → rate 2/3, rawN 4, eff 3.
      const winVsHero = { gamesWonA: 2, gamesWonB: 1 };
      const lossVsHero = { gamesWonA: 0, gamesWonB: 2 };
      const drawVsHero = { gamesWonA: 1, gamesWonB: 1 };
      for (const result of [winVsHero, winVsHero, lossVsHero, drawVsHero]) {
        await createGameLog(prisma, {
          teamId: teamA.id,
          loggedById: memberA.id,
          formatId: fabFormatId,
          pilotUserId: memberA.id,
          deckId: ourDeck.id,
          // Opponent hero + label normalizes to the same ref as the hero entry.
          opponentHeroId: fabHeroId,
          opponentArchetypeLabel: "Dorinthea",
          confidenceWeight: 1,
          ...result,
        });
      }
      // vs the archetype (matched case-insensitively): a single win.
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA.id,
        formatId: fabFormatId,
        pilotUserId: memberA.id,
        deckId: ourDeck.id,
        opponentArchetypeLabel: "aggro red",
        confidenceWeight: 1,
        gamesWonA: 2,
        gamesWonB: 0,
      });
      // A game-plan exists for the hero matchup only — its opponent subject (hero +
      // the same "Dorinthea" label) normalizes to the same opponentRef as the entry.
      await createMatchupGamePlan(prisma, {
        teamId: teamA.id,
        ourDeckId: ourDeck.id,
        formatId: fabFormatId,
        updatedById: memberA.id,
        opponentHeroId: fabHeroId,
        opponentArchetypeLabel: "Dorinthea",
      });

      const response = await asMemberA(
        http().get(`/api/decks/${ourDeck.id}/meta-readiness`).query({ metaId: meta.id }),
      );
      expect(response.status).toBe(200);
      expect(response.body.metaId).toBe(meta.id);
      // Rows are tier-ordered: meta_defining (hero) before contender (archetype).
      const [heroRow, archetypeRow] = response.body.rows;
      expect(heroRow.metaDeckEntryId).toBe(heroEntry.id);
      // The row carries the entry's hero id + label so the client can format the subject name.
      expect(heroRow.heroId).toBe(fabHeroId);
      expect(heroRow.label).toBe("Dorinthea");
      expect(heroRow.weightedWinRate).toBeCloseTo(0.6667, 4);
      expect(heroRow.rawSampleCount).toBe(4);
      expect(heroRow.effectiveSample).toBe(3);
      expect(heroRow.trustIndicator).toBe("low");
      expect(heroRow.hasGamePlan).toBe(true);

      expect(archetypeRow.metaDeckEntryId).toBe(archetypeEntry.id);
      // A label-only (hero-less) entry reports a null heroId and its archetype label.
      expect(archetypeRow.heroId).toBeNull();
      expect(archetypeRow.label).toBe("Aggro Red");
      expect(archetypeRow.weightedWinRate).toBe(1);
      expect(archetypeRow.rawSampleCount).toBe(1);
      expect(archetypeRow.hasGamePlan).toBe(false);
    });

    it("aggregates two entries with the SAME hero but different labels distinctly", async () => {
      const ourDeck = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
        name: "Ours",
      });
      const meta = await createMeta(prisma, { teamId: teamA.id, name: "July" });
      // Two archetypes of the same hero, distinguished only by their label.
      const aggroEntry = await createMetaDeckEntry(prisma, {
        metaId: meta.id,
        teamId: teamA.id,
        tier: "meta_defining",
        heroId: fabHeroId,
        label: "Aggro Dorinthea",
        opponentSnapshotLabel: "Aggro Dorinthea",
      });
      const fatigueEntry = await createMetaDeckEntry(prisma, {
        metaId: meta.id,
        teamId: teamA.id,
        tier: "meta_defining",
        heroId: fabHeroId,
        label: "Fatigue Dorinthea",
        opponentSnapshotLabel: "Fatigue Dorinthea",
      });

      // Two wins vs Aggro Dorinthea (matched by hero+label ref) …
      for (let index = 0; index < 2; index += 1) {
        await createGameLog(prisma, {
          teamId: teamA.id,
          loggedById: memberA.id,
          formatId: fabFormatId,
          pilotUserId: memberA.id,
          deckId: ourDeck.id,
          opponentHeroId: fabHeroId,
          opponentArchetypeLabel: "Aggro Dorinthea",
          confidenceWeight: 1,
          gamesWonA: 2,
          gamesWonB: 0,
        });
      }
      // … and one loss vs Fatigue Dorinthea, linked directly to its entry.
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA.id,
        formatId: fabFormatId,
        pilotUserId: memberA.id,
        deckId: ourDeck.id,
        opponentMetaDeckEntryId: fatigueEntry.id,
        confidenceWeight: 1,
        gamesWonA: 0,
        gamesWonB: 2,
      });

      const response = await asMemberA(
        http().get(`/api/decks/${ourDeck.id}/meta-readiness`).query({ metaId: meta.id }),
      );
      expect(response.status).toBe(200);
      const rows: {
        metaDeckEntryId: string;
        weightedWinRate: number | null;
        rawSampleCount: number;
      }[] = response.body.rows;
      const aggroRow = rows.find((row) => row.metaDeckEntryId === aggroEntry.id);
      const fatigueRow = rows.find((row) => row.metaDeckEntryId === fatigueEntry.id);
      // The Aggro logs do NOT leak into the Fatigue entry and vice versa.
      expect(aggroRow?.weightedWinRate).toBe(1);
      expect(aggroRow?.rawSampleCount).toBe(2);
      expect(fatigueRow?.weightedWinRate).toBe(0);
      expect(fatigueRow?.rawSampleCount).toBe(1);
    });

    it("defaults to the most recent meta of the deck's format (not another format's)", async () => {
      const ourDeck = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
      });
      // No meta at all → graceful empty read (no 404).
      const empty = await asMemberA(http().get(`/api/decks/${ourDeck.id}/meta-readiness`));
      expect(empty.status).toBe(200);
      expect(empty.body.metaId).toBe("");
      expect(empty.body.rows).toEqual([]);

      // A meta of ANOTHER format is not chosen — the deck's format still has none.
      const blitz = await createFormat(prisma, {
        gameId: "flesh-and-blood",
        key: "blitz",
        name: "Blitz",
        isConstructed: false,
      });
      await createMeta(prisma, {
        teamId: teamA.id,
        formatId: blitz.id,
        name: "Blitz meta",
        startDate: new Date("2030-01-01T00:00:00.000Z"),
        endDate: new Date("2030-02-01T00:00:00.000Z"),
      });
      const stillEmpty = await asMemberA(http().get(`/api/decks/${ourDeck.id}/meta-readiness`));
      expect(stillEmpty.body.metaId).toBe("");

      // Two metas of the deck's format → the newer one (max startDate) is defaulted.
      await createMeta(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        name: "Old",
        startDate: new Date("2020-01-01T00:00:00.000Z"),
        endDate: new Date("2020-02-01T00:00:00.000Z"),
      });
      const newer = await createMeta(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        name: "Now",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-08-01T00:00:00.000Z"),
      });
      await createMetaDeckEntry(prisma, {
        metaId: newer.id,
        teamId: teamA.id,
        heroId: fabHeroId,
        opponentSnapshotLabel: "Dorinthea",
      });
      const withDefault = await asMemberA(http().get(`/api/decks/${ourDeck.id}/meta-readiness`));
      expect(withDefault.status).toBe(200);
      expect(withDefault.body.metaId).toBe(newer.id);
      expect(withDefault.body.rows).toHaveLength(1);
    });

    it("does not read another team's deck readiness (cross-tenant → 404)", async () => {
      const bDeck = await createDeck(prisma, {
        teamId: teamB.id,
        ownerId: memberB.id,
        formatId: fabFormatId,
      });
      const response = await asMemberA(http().get(`/api/decks/${bDeck.id}/meta-readiness`));
      expect(response.status).toBe(404);
    });

    it("rejects a metaId from another team (cross-tenant → 404)", async () => {
      const ourDeck = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
      });
      const foreignMeta = await createMeta(prisma, { teamId: teamB.id });
      const response = await asMemberA(
        http().get(`/api/decks/${ourDeck.id}/meta-readiness`).query({ metaId: foreignMeta.id }),
      );
      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/decks/recognize-url", () => {
    it("recognizes a Fabrary URL (metadata only, no fetch)", async () => {
      const response = await asMemberA(http().post("/api/decks/recognize-url")).send({
        url: fabrikaryUrl,
      });
      expect(response.status).toBe(200);
      expect(response.body.recognized).toEqual({ provider: "fabrary", externalId: "abc123" });
    });

    it("returns null for an unrecognized URL", async () => {
      const response = await asMemberA(http().post("/api/decks/recognize-url")).send({
        url: "https://example.com/x",
      });
      expect(response.status).toBe(200);
      expect(response.body.recognized).toBeNull();
    });
  });
});
