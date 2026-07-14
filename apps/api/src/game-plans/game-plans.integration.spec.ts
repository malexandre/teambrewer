import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import {
  addMembership,
  createCard,
  createDeck,
  createFormat,
  createGame,
  createHero,
  createMatchupGamePlan,
  createMeta,
  createMetaDeckEntry,
  createTeam,
  createTestPrismaClient,
  createUser,
  type TestCard,
  type TestDeck,
  type TestTeam,
  type TestUser,
} from "../../test/factories.js";
import { createApiTestApp } from "../../test/nest-app.js";
import { AppModule } from "../app.module.js";
import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Endpoint tests for matchup game-plans. The critical properties are tenant isolation
 * (a team never reaches another team's plans), the one-canonical-plan-per-matchup rule
 * (duplicate create → 409, edit updates in place and stamps updatedBy), and cross-team
 * / cross-game FK rejection for the deck, key cards, and opponent references.
 */
describe("Game-plans endpoints (integration)", () => {
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
  let deckB: TestDeck;
  let cardA: TestCard;
  let cardA2: TestCard;

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
      await createFormat(prisma, { gameId: "riftbound", key: "std", name: "Standard" })
    ).id;
    riftHeroId = (await createHero(prisma, { gameId: "riftbound", name: "Rift Legend" })).id;

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
    cardA = await createCard(prisma, { name: "Command and Conquer" });
    cardA2 = await createCard(prisma, { name: "Snatch" });
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
    ourDeckId: deckA.id,
    formatId: fabFormatId,
    opponentHeroId: fabHeroId,
    opponentArchetypeLabel: "Draconic Dorinthea",
    // Key cards are referenced inline in the body as +[[cardId]] tokens (WS-4).
    body: `Mulligan for +[[${cardA.id}]]; sequence attacks before defense reactions.`,
  });

  describe("POST /api/game-plans", () => {
    it("creates a plan, stamping teamId/updatedBy server-side and resolving the opponent subject", async () => {
      const response = await asMemberA(http().post("/api/game-plans")).send({
        ...validBody(),
        teamId: teamB.id,
        updatedById: memberB.id,
      });
      expect(response.status).toBe(201);
      expect(response.body.opponentHeroId).toBe(fabHeroId);
      expect(response.body.opponentArchetypeLabel).toBe("Draconic Dorinthea");
      expect(response.body.opponentSnapshotLabel).toBe("Draconic Dorinthea");
      // The ref encodes hero + lowercased label so repeated heroes stay distinct.
      expect(response.body.opponentRef).toBe(`hero:${fabHeroId}|label:draconic dorinthea`);
      expect(response.body.metaDeckEntryIds).toEqual([]);
      expect(response.body.updatedBy.userId).toBe(memberA.id);
      // The body carries the inline card token verbatim (resolved to a chip in the UI).
      expect(response.body.body).toContain(`+[[${cardA.id}]]`);
    });

    it("accepts a label-only opponent subject", async () => {
      const { opponentHeroId, ...labelOnly } = validBody();
      void opponentHeroId;
      const response = await asMemberA(http().post("/api/game-plans")).send({
        ...labelOnly,
        opponentArchetypeLabel: "Aggro Fai",
      });
      expect(response.status).toBe(201);
      expect(response.body.opponentHeroId).toBeNull();
      expect(response.body.opponentRef).toBe("label:aggro fai");
    });

    it("rejects a second create for the same matchup key with 409", async () => {
      await asMemberA(http().post("/api/game-plans")).send(validBody());
      const dup = await asMemberA2(http().post("/api/game-plans")).send(validBody());
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe("CONFLICT");
    });

    it("rejects a plan with no opponent label (400)", async () => {
      const { opponentArchetypeLabel, ...withoutLabel } = validBody();
      void opponentArchetypeLabel;
      const response = await asMemberA(http().post("/api/game-plans")).send(withoutLabel);
      expect(response.status).toBe(400);
    });

    it("attaches meta deck entries and rejects an entry from another team (422)", async () => {
      const meta = await createMeta(prisma, { teamId: teamA.id });
      const entry = await createMetaDeckEntry(prisma, {
        metaId: meta.id,
        teamId: teamA.id,
        heroId: fabHeroId,
        label: "Draconic Dorinthea",
      });
      const created = await asMemberA(http().post("/api/game-plans")).send({
        ...validBody(),
        metaDeckEntryIds: [entry.id],
      });
      expect(created.status).toBe(201);
      expect(created.body.metaDeckEntryIds).toEqual([entry.id]);

      const foreignMeta = await createMeta(prisma, { teamId: teamB.id });
      const foreignEntry = await createMetaDeckEntry(prisma, {
        metaId: foreignMeta.id,
        teamId: teamB.id,
        label: "Bravo Deck",
      });
      const rejected = await asMemberA(http().post("/api/game-plans")).send({
        ...validBody(),
        opponentArchetypeLabel: "Another Matchup",
        metaDeckEntryIds: [foreignEntry.id],
      });
      expect(rejected.status).toBe(422);
    });

    it("rejects a deck from another team (cross-team FK → 422)", async () => {
      const response = await asMemberA(http().post("/api/game-plans")).send({
        ...validBody(),
        ourDeckId: deckB.id,
      });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("DOMAIN_RULE_VIOLATION");
    });

    it("rejects a hero from another game (→ 404)", async () => {
      const response = await asMemberA(http().post("/api/game-plans")).send({
        ...validBody(),
        opponentHeroId: riftHeroId,
      });
      expect(response.status).toBe(404);
    });

    it("rejects a format from another game (→ 404)", async () => {
      const response = await asMemberA(http().post("/api/game-plans")).send({
        ...validBody(),
        formatId: riftFormatId,
      });
      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/game-plans", () => {
    it("lists the team's plans, filterable by ourDeckId", async () => {
      await asMemberA(http().post("/api/game-plans")).send(validBody());
      const response = await asMemberA(http().get("/api/game-plans")).query({
        ourDeckId: deckA.id,
      });
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].ourDeckId).toBe(deckA.id);
    });
  });

  describe("PATCH /api/game-plans/:gamePlanId", () => {
    it("updates the body in place and stamps the new updatedBy", async () => {
      const created = await asMemberA(http().post("/api/game-plans")).send(validBody());
      const planId = created.body.id;
      const updated = await asMemberA2(http().patch(`/api/game-plans/${planId}`)).send({
        body: `Revised: keep +[[${cardA2.id}]] for the on-hit.`,
      });
      expect(updated.status).toBe(200);
      expect(updated.body.id).toBe(planId);
      expect(updated.body.body).toContain("Revised");
      expect(updated.body.body).toContain(`+[[${cardA2.id}]]`);
      expect(updated.body.updatedBy.userId).toBe(memberA2.id);
    });
  });

  describe("DELETE /api/game-plans/:gamePlanId", () => {
    it("lets a team-admin archive (soft-delete) the plan", async () => {
      const created = await asMemberA(http().post("/api/game-plans")).send(validBody());
      const del = await asAdminA(http().delete(`/api/game-plans/${created.body.id}`));
      expect(del.status).toBe(204);
      const list = await asMemberA(http().get("/api/game-plans"));
      expect(list.body.data).toHaveLength(0);
    });

    it("rejects a non-admin member archiving a plan (→ 403)", async () => {
      const created = await asMemberA(http().post("/api/game-plans")).send(validBody());
      const del = await asMemberA2(http().delete(`/api/game-plans/${created.body.id}`));
      expect(del.status).toBe(403);
      expect(del.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("tenant isolation", () => {
    it("does not return another team's plan (cross-tenant read → 404)", async () => {
      const foreign = await createMatchupGamePlan(prisma, {
        teamId: teamB.id,
        ourDeckId: deckB.id,
        formatId: fabFormatId,
        updatedById: memberB.id,
        opponentHeroId: fabHeroId,
      });
      const response = await asMemberA(http().get(`/api/game-plans/${foreign.id}`));
      expect(response.status).toBe(404);
    });

    it("does not let a team member forge a foreign X-Team-Id (→ 403)", async () => {
      const response = await http()
        .get("/api/game-plans")
        .set("x-test-user-id", memberA.id)
        .set("x-team-id", teamB.id);
      expect(response.status).toBe(403);
    });

    it("scopes the list to the caller's team", async () => {
      await createMatchupGamePlan(prisma, {
        teamId: teamB.id,
        ourDeckId: deckB.id,
        formatId: fabFormatId,
        updatedById: memberB.id,
        opponentHeroId: fabHeroId,
      });
      const response = await asMemberB(http().get("/api/game-plans"));
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
    });
  });
});
