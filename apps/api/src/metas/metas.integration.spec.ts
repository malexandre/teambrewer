import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import {
  addMembership,
  createGame,
  createHero,
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
 * Endpoint tests for metas and their tiered deck lists. The critical properties are
 * tenant isolation (a team never reaches another team's metas/entries), the
 * current-meta resolution, the deck-entry matchup-subject rules (label required,
 * optional hero qualifier, repeated heroes, cross-game hero, exact duplicates), and
 * that a meta emits its lifecycle activity. A two-team Flesh and Blood world plus a
 * Riftbound game (for cross-game rejection) backs the suite.
 */
describe("Metas endpoints (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let teamA: TestTeam;
  let teamB: TestTeam;
  let adminA: TestUser;
  let memberA: TestUser;
  let memberA2: TestUser;
  let memberB: TestUser;

  let fabHeroId: string;
  let riftHeroId: string;

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

    fabHeroId = (await createHero(prisma, { gameId: "flesh-and-blood", name: "Dorinthea" })).id;
    riftHeroId = (await createHero(prisma, { gameId: "riftbound", name: "Rift Legend" })).id;
  });

  const http = () => request(app.getHttpServer());
  const asMemberA = (req: request.Test) =>
    req.set("x-test-user-id", memberA.id).set("x-team-id", teamA.id);
  const asMemberA2 = (req: request.Test) =>
    req.set("x-test-user-id", memberA2.id).set("x-team-id", teamA.id);
  const asAdminA = (req: request.Test) =>
    req.set("x-test-user-id", adminA.id).set("x-team-id", teamA.id);

  const validMeta = () => ({
    name: "Summer Season",
    startDate: "2026-07-01",
    endDate: "2026-08-31",
    description: "The post-rotation field.",
  });

  describe("POST /api/metas", () => {
    it("creates a meta, stamping teamId server-side and ignoring a spoofed teamId", async () => {
      const response = await asMemberA(http().post("/api/metas")).send({
        ...validMeta(),
        teamId: teamB.id,
      });
      expect(response.status).toBe(201);
      expect(response.body.name).toBe("Summer Season");
      expect(response.body.description).toBe("The post-rotation field.");
      expect(response.body.archivedAt).toBeNull();

      const persisted = await prisma.meta.findUnique({ where: { id: response.body.id } });
      expect(persisted?.teamId).toBe(teamA.id);
    });

    it("rejects an out-of-order window with 400", async () => {
      const response = await asMemberA(http().post("/api/metas")).send({
        ...validMeta(),
        startDate: "2026-08-31",
        endDate: "2026-07-01",
      });
      expect(response.status).toBe(400);
    });

    it("rejects a missing name with 400", async () => {
      const response = await asMemberA(http().post("/api/metas")).send({
        startDate: "2026-07-01",
        endDate: "2026-08-31",
      });
      expect(response.status).toBe(400);
    });

    it("records a meta_created activity event", async () => {
      const created = await asMemberA(http().post("/api/metas")).send(validMeta());
      const events = await prisma.activityEvent.findMany({
        where: { teamId: teamA.id, subjectType: "meta", subjectId: created.body.id },
      });
      expect(events.map((event) => event.verb)).toContain("meta_created");
    });
  });

  describe("GET /api/metas", () => {
    it("lists the team's non-archived metas, newest window first", async () => {
      await createMeta(prisma, {
        teamId: teamA.id,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-02-01"),
      });
      await createMeta(prisma, {
        teamId: teamA.id,
        startDate: new Date("2026-06-01"),
        endDate: new Date("2026-07-01"),
      });
      await createMeta(prisma, { teamId: teamA.id, archivedAt: new Date() });
      // Another team's meta must never appear.
      await createMeta(prisma, { teamId: teamB.id });

      const response = await asMemberA(http().get("/api/metas"));
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(new Date(response.body.data[0].startDate).getTime()).toBeGreaterThan(
        new Date(response.body.data[1].startDate).getTime(),
      );
    });

    it("paginates with a keyset cursor", async () => {
      for (let index = 0; index < 3; index += 1) {
        await createMeta(prisma, {
          teamId: teamA.id,
          startDate: new Date(`2026-0${index + 1}-01T00:00:00.000Z`),
          endDate: new Date(`2026-0${index + 2}-01T00:00:00.000Z`),
        });
      }
      const firstPage = await asMemberA(http().get("/api/metas?limit=2"));
      expect(firstPage.body.data).toHaveLength(2);
      expect(firstPage.body.nextCursor).not.toBeNull();

      const secondPage = await asMemberA(
        http().get(`/api/metas?limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`),
      );
      expect(secondPage.body.data).toHaveLength(1);
      expect(secondPage.body.nextCursor).toBeNull();
    });
  });

  describe("GET /api/metas/current", () => {
    it("resolves the current meta and prefers the latest-starting on overlap", async () => {
      await createMeta(prisma, {
        teamId: teamA.id,
        name: "Old and wide",
        startDate: new Date("2020-01-01"),
        endDate: new Date("2100-01-01"),
      });
      const newer = await createMeta(prisma, {
        teamId: teamA.id,
        name: "Newer",
        startDate: new Date("2021-01-01"),
        endDate: new Date("2099-01-01"),
      });

      const response = await asMemberA(http().get("/api/metas/current"));
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(newer.id);
      expect(response.body.name).toBe("Newer");
    });

    it("returns 404 when no meta contains today", async () => {
      await createMeta(prisma, {
        teamId: teamA.id,
        startDate: new Date("2000-01-01"),
        endDate: new Date("2000-02-01"),
      });
      const response = await asMemberA(http().get("/api/metas/current"));
      expect(response.status).toBe(404);
    });

    it("never resolves another team's meta as current", async () => {
      await createMeta(prisma, {
        teamId: teamB.id,
        startDate: new Date("2020-01-01"),
        endDate: new Date("2100-01-01"),
      });
      const response = await asMemberA(http().get("/api/metas/current"));
      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/metas/:metaId", () => {
    it("returns a meta's detail", async () => {
      const meta = await createMeta(prisma, { teamId: teamA.id, description: "Notes here." });
      const response = await asMemberA(http().get(`/api/metas/${meta.id}`));
      expect(response.status).toBe(200);
      expect(response.body.description).toBe("Notes here.");
    });

    it("returns 404 for an archived meta", async () => {
      const meta = await createMeta(prisma, { teamId: teamA.id, archivedAt: new Date() });
      const response = await asMemberA(http().get(`/api/metas/${meta.id}`));
      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/metas/:metaId", () => {
    it("updates fields and records a meta_updated activity event", async () => {
      const meta = await createMeta(prisma, { teamId: teamA.id });
      const response = await asMemberA(http().patch(`/api/metas/${meta.id}`)).send({
        name: "Renamed season",
      });
      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Renamed season");

      const events = await prisma.activityEvent.findMany({
        where: { teamId: teamA.id, subjectType: "meta", subjectId: meta.id },
      });
      expect(events.map((event) => event.verb)).toContain("meta_updated");
    });

    it("rejects a partial update that would invert the stored window with 422", async () => {
      const meta = await createMeta(prisma, {
        teamId: teamA.id,
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-08-01"),
      });
      // Move only the start date past the existing end date.
      const response = await asMemberA(http().patch(`/api/metas/${meta.id}`)).send({
        startDate: "2026-09-01",
      });
      expect(response.status).toBe(422);
    });

    it("rejects an empty update with 400", async () => {
      const meta = await createMeta(prisma, { teamId: teamA.id });
      const response = await asMemberA(http().patch(`/api/metas/${meta.id}`)).send({});
      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /api/metas/:metaId", () => {
    it("archives a meta (soft-delete) and returns 204", async () => {
      const meta = await createMeta(prisma, { teamId: teamA.id });
      const response = await asMemberA(http().delete(`/api/metas/${meta.id}`));
      expect(response.status).toBe(204);

      const persisted = await prisma.meta.findUnique({ where: { id: meta.id } });
      expect(persisted?.archivedAt).not.toBeNull();
    });
  });

  describe("Deck entries", () => {
    it("adds a hero-qualified entry and a label-only entry with derived snapshot labels", async () => {
      const meta = await createMeta(prisma, { teamId: teamA.id });

      const byHero = await asMemberA(http().post(`/api/metas/${meta.id}/deck-entries`)).send({
        tier: "meta_defining",
        heroId: fabHeroId,
        label: "Draconic Dorinthea",
      });
      expect(byHero.status).toBe(201);
      expect(byHero.body.heroId).toBe(fabHeroId);
      expect(byHero.body.label).toBe("Draconic Dorinthea");
      expect(byHero.body.opponentSnapshotLabel).toBe("Draconic Dorinthea");

      const byLabel = await asMemberA(http().post(`/api/metas/${meta.id}/deck-entries`)).send({
        tier: "fringe",
        label: "Aggro Red",
      });
      expect(byLabel.status).toBe(201);
      expect(byLabel.body.heroId).toBeNull();
      expect(byLabel.body.opponentSnapshotLabel).toBe("Aggro Red");

      const list = await asMemberA(http().get(`/api/metas/${meta.id}/deck-entries`));
      expect(list.body.data).toHaveLength(2);
      // Sorted by tier priority: meta_defining → fringe.
      expect(list.body.data.map((entry: { tier: string }) => entry.tier)).toEqual([
        "meta_defining",
        "fringe",
      ]);
    });

    it("requires at least a hero or a label with 400", async () => {
      const meta = await createMeta(prisma, { teamId: teamA.id });
      const none = await asMemberA(http().post(`/api/metas/${meta.id}/deck-entries`)).send({
        tier: "contender",
      });
      expect(none.status).toBe(400);
    });

    it("adds a hero-only entry (no label), deriving the snapshot from the hero name", async () => {
      const meta = await createMeta(prisma, { teamId: teamA.id });
      const heroOnly = await asMemberA(http().post(`/api/metas/${meta.id}/deck-entries`)).send({
        tier: "contender",
        heroId: fabHeroId,
      });
      expect(heroOnly.status).toBe(201);
      expect(heroOnly.body.heroId).toBe(fabHeroId);
      expect(heroOnly.body.label).toBe("");
      // The durable snapshot label falls back to the hero's name when there is no label.
      expect(heroOnly.body.opponentSnapshotLabel.length).toBeGreaterThan(0);
    });

    it("rejects an unknown tier with 400", async () => {
      const meta = await createMeta(prisma, { teamId: teamA.id });
      const response = await asMemberA(http().post(`/api/metas/${meta.id}/deck-entries`)).send({
        tier: "tier_one",
        label: "Aggro Red",
      });
      expect(response.status).toBe(400);
    });

    it("rejects only an EXACT duplicate (same hero + same label) with 422, allowing repeated heroes", async () => {
      const meta = await createMeta(prisma, { teamId: teamA.id });
      await createMetaDeckEntry(prisma, {
        metaId: meta.id,
        teamId: teamA.id,
        heroId: fabHeroId,
        label: "Fatigue Dorinthea",
      });

      // Same hero, DIFFERENT label → allowed (repeated heroes are distinguished by label).
      const differentLabel = await asMemberA(
        http().post(`/api/metas/${meta.id}/deck-entries`),
      ).send({ tier: "contender", heroId: fabHeroId, label: "Aggro Dorinthea" });
      expect(differentLabel.status).toBe(201);

      // Same hero + same label (case-insensitive) → rejected as an exact duplicate.
      const exact = await asMemberA(http().post(`/api/metas/${meta.id}/deck-entries`)).send({
        tier: "contender",
        heroId: fabHeroId,
        label: "fatigue dorinthea",
      });
      expect(exact.status).toBe(422);
    });

    it("rejects a case-insensitive duplicate label-only subject with 422", async () => {
      const meta = await createMeta(prisma, { teamId: teamA.id });
      await createMetaDeckEntry(prisma, { metaId: meta.id, teamId: teamA.id, label: "Aggro Red" });
      const response = await asMemberA(http().post(`/api/metas/${meta.id}/deck-entries`)).send({
        tier: "contender",
        label: "aggro red",
      });
      expect(response.status).toBe(422);
    });

    it("rejects a hero from another game with 422 (cross-game FK)", async () => {
      const meta = await createMeta(prisma, { teamId: teamA.id });
      const response = await asMemberA(http().post(`/api/metas/${meta.id}/deck-entries`)).send({
        tier: "contender",
        heroId: riftHeroId,
        label: "Some Riftbound Deck",
      });
      expect(response.status).toBe(422);
    });

    it("edits the whole matchup subject (tier, label, hero, notes) and removes it", async () => {
      const meta = await createMeta(prisma, { teamId: teamA.id });
      const entry = await createMetaDeckEntry(prisma, {
        metaId: meta.id,
        teamId: teamA.id,
        heroId: fabHeroId,
        label: "Draconic Dorinthea",
        tier: "contender",
      });

      const updated = await asMemberA(
        http().patch(`/api/metas/${meta.id}/deck-entries/${entry.id}`),
      ).send({
        tier: "meta_defining",
        label: "Now the top deck",
        heroId: null,
        notes: "Reclassified.",
      });
      expect(updated.status).toBe(200);
      expect(updated.body.tier).toBe("meta_defining");
      expect(updated.body.label).toBe("Now the top deck");
      expect(updated.body.heroId).toBeNull();
      expect(updated.body.opponentSnapshotLabel).toBe("Now the top deck");
      expect(updated.body.notes).toBe("Reclassified.");

      const removed = await asMemberA(
        http().delete(`/api/metas/${meta.id}/deck-entries/${entry.id}`),
      );
      expect(removed.status).toBe(204);
      const list = await asMemberA(http().get(`/api/metas/${meta.id}/deck-entries`));
      expect(list.body.data).toHaveLength(0);
    });
  });

  describe("Tenant isolation (mandatory)", () => {
    it("returns 404 when a team-A user reads a team-B meta / its deck entries", async () => {
      const metaB = await createMeta(prisma, { teamId: teamB.id });
      const entryB = await createMetaDeckEntry(prisma, {
        metaId: metaB.id,
        teamId: teamB.id,
        heroId: fabHeroId,
      });

      const getMeta = await asMemberA(http().get(`/api/metas/${metaB.id}`));
      const listEntries = await asMemberA(http().get(`/api/metas/${metaB.id}/deck-entries`));
      const updateEntry = await asMemberA(
        http().patch(`/api/metas/${metaB.id}/deck-entries/${entryB.id}`),
      ).send({ tier: "fringe" });
      expect([getMeta.status, listEntries.status, updateEntry.status]).toEqual([404, 404, 404]);
    });

    it("returns 404 (never mutates) when a team-A user writes to a team-B meta", async () => {
      const metaB = await createMeta(prisma, { teamId: teamB.id, name: "Bravo Meta" });

      const update = await asMemberA(http().patch(`/api/metas/${metaB.id}`)).send({
        name: "Hijacked",
      });
      const archive = await asMemberA(http().delete(`/api/metas/${metaB.id}`));
      const addEntry = await asMemberA(http().post(`/api/metas/${metaB.id}/deck-entries`)).send({
        tier: "contender",
        heroId: fabHeroId,
        label: "Draconic Dorinthea",
      });
      expect([update.status, archive.status, addEntry.status]).toEqual([404, 404, 404]);

      const untouched = await prisma.meta.findUnique({ where: { id: metaB.id } });
      expect(untouched?.name).toBe("Bravo Meta");
      expect(untouched?.archivedAt).toBeNull();
      const entries = await prisma.metaDeckEntry.findMany({ where: { metaId: metaB.id } });
      expect(entries).toHaveLength(0);
    });

    it("returns 403 for a forged team the caller is not a member of", async () => {
      const metaA = await createMeta(prisma, { teamId: teamA.id });
      // memberB forges team A's id but is only a member of team B.
      const response = await http()
        .get(`/api/metas/${metaA.id}`)
        .set("x-test-user-id", memberB.id)
        .set("x-team-id", teamA.id);
      expect(response.status).toBe(403);
    });
  });

  describe("Shared team board permissions", () => {
    it("lets any member — not just the creator or an admin — edit, add entries, and archive", async () => {
      const created = await asMemberA(http().post("/api/metas")).send(validMeta());
      const metaId = created.body.id;

      const edited = await asMemberA2(http().patch(`/api/metas/${metaId}`)).send({
        name: "Edited by a teammate",
      });
      expect(edited.status).toBe(200);

      const entry = await asMemberA2(http().post(`/api/metas/${metaId}/deck-entries`)).send({
        tier: "contender",
        heroId: fabHeroId,
        label: "Draconic Dorinthea",
      });
      expect(entry.status).toBe(201);

      const archived = await asAdminA(http().delete(`/api/metas/${metaId}`));
      expect(archived.status).toBe(204);
    });
  });
});
