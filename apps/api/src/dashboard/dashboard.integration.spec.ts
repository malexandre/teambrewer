import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import {
  addMembership,
  createAttendance,
  createDeck,
  createDeckSelection,
  createEvent,
  createFormat,
  createGame,
  createGameLog,
  createGauntletEntry,
  createHero,
  createTeam,
  createTestAssignment,
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
 * Endpoint tests for the dashboard (phase-11). The dashboard composes the source
 * modules, so the critical properties are: composition correctness (my active
 * assignments, upcoming events with my RSVP/selection, recent results with the
 * outcome from my perspective) matches the crafted fixture exactly; the
 * "what to test next" ranking is ordered per opponent archetype (share × coverage
 * gap); and tenant isolation holds absolutely — a forged team → 403, a cross-tenant
 * eventId → 404, a user in two teams sees only the active team's rows, and team A's
 * aggregates never include a team B row.
 */
describe("Dashboard endpoints (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let teamA: TestTeam;
  let teamB: TestTeam;
  let teamC: TestTeam;
  let teamEmpty: TestTeam;
  let adminA: TestUser;
  let memberA: TestUser;

  let formatId: string;
  let heroKanoId: string;
  let heroFangId: string;
  let heroDorintheaId: string;

  let ourDeckA: TestDeck;
  let referenceFangA: TestDeck;
  let ourDeckB: TestDeck;

  let eventA: TestEvent;
  let eventB: TestEvent;

  let gauntletKanoA: { id: string };
  let gauntletFangA: { id: string };
  let gauntletAggroA: { id: string };

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
    teamC = await createTeam(prisma, { name: "Charlie", gameId: "flesh-and-blood" });
    teamEmpty = await createTeam(prisma, { name: "Empty", gameId: "flesh-and-blood" });
    adminA = await createUser(prisma, { username: "admin_a", displayName: "Admin A" });
    memberA = await createUser(prisma, { username: "member_a", displayName: "Member A" });

    await addMembership(prisma, { teamId: teamA.id, userId: adminA.id, role: "team_admin" });
    await addMembership(prisma, { teamId: teamA.id, userId: memberA.id, role: "member" });
    // memberA belongs to team B too — the multi-team personal-scoping case.
    await addMembership(prisma, { teamId: teamB.id, userId: memberA.id, role: "member" });
    await addMembership(prisma, { teamId: teamEmpty.id, userId: memberA.id, role: "member" });
    // memberA is deliberately NOT a member of team C (the forged-team case).

    formatId = (
      await createFormat(prisma, {
        gameId: "flesh-and-blood",
        key: "cc",
        name: "Classic Constructed",
      })
    ).id;
    heroKanoId = (await createHero(prisma, { gameId: "flesh-and-blood", name: "Kano" })).id;
    heroFangId = (await createHero(prisma, { gameId: "flesh-and-blood", name: "Fang" })).id;
    heroDorintheaId = (await createHero(prisma, { gameId: "flesh-and-blood", name: "Dorinthea" }))
      .id;

    ourDeckA = await createDeck(prisma, {
      teamId: teamA.id,
      ownerId: memberA.id,
      formatId,
      heroId: heroDorintheaId,
      name: "Our Dori",
    });
    referenceFangA = await createDeck(prisma, {
      teamId: teamA.id,
      ownerId: adminA.id,
      formatId,
      heroId: heroFangId,
      name: "Fang Reference",
      isReference: true,
    });
    ourDeckB = await createDeck(prisma, {
      teamId: teamB.id,
      ownerId: memberA.id,
      formatId,
      heroId: heroDorintheaId,
      name: "Team B Dori",
    });

    // Team A: two upcoming events (nearest first must sort earliest-dated first).
    eventA = await createEvent(prisma, {
      teamId: teamA.id,
      formatId,
      name: "Nationals",
      date: new Date("2026-09-12T00:00:00.000Z"),
    });
    // A second, later upcoming event (not captured — only asserted by name).
    await createEvent(prisma, {
      teamId: teamA.id,
      formatId,
      name: "Regional Later",
      date: new Date("2026-10-01T00:00:00.000Z"),
    });
    eventB = await createEvent(prisma, {
      teamId: teamB.id,
      formatId,
      name: "Rival Cup",
      date: new Date("2026-09-20T00:00:00.000Z"),
    });

    // Team A gauntlet: Kano (share 60, untested), Fang (share 30, thin), Aggro (share 10, untested).
    gauntletKanoA = await createGauntletEntry(prisma, {
      eventId: eventA.id,
      teamId: teamA.id,
      heroId: heroKanoId,
      expectedMetaShare: 60,
    });
    gauntletFangA = await createGauntletEntry(prisma, {
      eventId: eventA.id,
      teamId: teamA.id,
      referenceDeckId: referenceFangA.id,
      expectedMetaShare: 30,
    });
    gauntletAggroA = await createGauntletEntry(prisma, {
      eventId: eventA.id,
      teamId: teamA.id,
      archetypeLabel: "Aggro Red",
      expectedMetaShare: 10,
    });
    // Team B gauntlet — distinct, to prove isolation of coverage.
    await createGauntletEntry(prisma, {
      eventId: eventB.id,
      teamId: teamB.id,
      heroId: heroKanoId,
      expectedMetaShare: 100,
    });

    // Fang matchup: two wins, weight 1.0 → effective sample 2 (thinly covered).
    for (let index = 0; index < 2; index += 1) {
      await createGameLog(prisma, {
        teamId: teamA.id,
        loggedById: memberA.id,
        formatId,
        pilotUserId: memberA.id,
        deckId: ourDeckA.id,
        opponentDeckId: referenceFangA.id,
        heroId: null,
        gamesWonA: 1,
        gamesWonB: 0,
        confidenceWeight: 1.0,
      });
    }
    // A memberA loss vs a non-gauntlet opponent (Dorinthea mirror) — recent results only.
    await createGameLog(prisma, {
      teamId: teamA.id,
      loggedById: memberA.id,
      formatId,
      pilotUserId: memberA.id,
      deckId: ourDeckA.id,
      heroId: heroDorintheaId,
      gamesWonA: 0,
      gamesWonB: 1,
      confidenceWeight: 1.0,
    });
    // A game where memberA piloted side B (adminA won) — outcome must flip to a loss.
    await createGameLog(prisma, {
      teamId: teamA.id,
      loggedById: adminA.id,
      formatId,
      pilotUserId: adminA.id,
      deckId: referenceFangA.id,
      opponentPilotUserId: memberA.id,
      heroId: heroDorintheaId,
      gamesWonA: 1,
      gamesWonB: 0,
      confidenceWeight: 1.0,
    });

    // memberA's assignments in team A: open (vs Kano), in_progress (vs Fang), done (excluded).
    await createTestAssignment(prisma, {
      teamId: teamA.id,
      assigneeId: memberA.id,
      assignedById: adminA.id,
      deckId: ourDeckA.id,
      eventId: eventA.id,
      opponentGauntletEntryId: gauntletKanoA.id,
      opponentSnapshotLabel: "vs Kano",
      status: "open",
    });
    await createTestAssignment(prisma, {
      teamId: teamA.id,
      assigneeId: memberA.id,
      assignedById: adminA.id,
      deckId: ourDeckA.id,
      eventId: eventA.id,
      opponentGauntletEntryId: gauntletFangA.id,
      opponentSnapshotLabel: "vs Fang",
      status: "in_progress",
    });
    await createTestAssignment(prisma, {
      teamId: teamA.id,
      assigneeId: memberA.id,
      assignedById: adminA.id,
      deckId: ourDeckA.id,
      eventId: eventA.id,
      opponentArchetypeLabel: "Aggro Red",
      opponentSnapshotLabel: "vs Aggro Red",
      status: "done",
    });

    // memberA's RSVP + deck selection for the nearest event (not for eventLater → nudge).
    await createAttendance(prisma, { eventId: eventA.id, userId: memberA.id, status: "going" });
    await createDeckSelection(prisma, {
      eventId: eventA.id,
      userId: memberA.id,
      deckId: ourDeckA.id,
    });

    // Team B data for memberA (active-team scoping) + isolation.
    await createGameLog(prisma, {
      teamId: teamB.id,
      loggedById: memberA.id,
      formatId,
      pilotUserId: memberA.id,
      deckId: ourDeckB.id,
      heroId: heroKanoId,
      gamesWonA: 1,
      gamesWonB: 0,
      confidenceWeight: 1.0,
    });
    await createTestAssignment(prisma, {
      teamId: teamB.id,
      assigneeId: memberA.id,
      assignedById: memberA.id,
      deckId: ourDeckB.id,
      eventId: eventB.id,
      opponentHeroId: heroKanoId,
      opponentSnapshotLabel: "vs Kano (B)",
      status: "open",
    });
    await createAttendance(prisma, { eventId: eventB.id, userId: memberA.id, status: "going" });
  });

  const http = () => request(app.getHttpServer());
  const asMemberA = (req: request.Test, teamId: string) =>
    req.set("x-test-user-id", memberA.id).set("x-team-id", teamId);

  describe("GET /api/dashboard/me", () => {
    it("returns only my open + in-progress assignments (excludes done)", async () => {
      const response = await asMemberA(http().get("/api/dashboard/me"), teamA.id);
      expect(response.status).toBe(200);
      const statuses = response.body.assignments
        .map((row: { status: string }) => row.status)
        .sort();
      expect(statuses).toEqual(["in_progress", "open"]);
    });

    it("lists upcoming events nearest first, with my RSVP + selection (null when unset)", async () => {
      const response = await asMemberA(http().get("/api/dashboard/me"), teamA.id);
      const upcoming = response.body.upcomingEvents;
      expect(upcoming.map((row: { event: { name: string } }) => row.event.name)).toEqual([
        "Nationals",
        "Regional Later",
      ]);
      expect(upcoming[0].myAttendance).toBe("going");
      expect(upcoming[0].myDeckSelection.deckId).toBe(ourDeckA.id);
      // No RSVP / selection recorded for the later event → nudge.
      expect(upcoming[1].myAttendance).toBeNull();
      expect(upcoming[1].myDeckSelection).toBeNull();
    });

    it("summarizes my recent results with the outcome from my perspective (side-B flips)", async () => {
      const response = await asMemberA(http().get("/api/dashboard/me"), teamA.id);
      const outcomes = response.body.recentResults
        .map((row: { outcome: string }) => row.outcome)
        .sort();
      // Two Fang wins, one Dorinthea loss, one side-B game (adminA won → my loss).
      expect(outcomes).toEqual(["loss", "loss", "win", "win"]);
    });

    it("scopes personal widgets to the active team for a multi-team user", async () => {
      const inA = await asMemberA(http().get("/api/dashboard/me"), teamA.id);
      const inB = await asMemberA(http().get("/api/dashboard/me"), teamB.id);

      expect(inA.body.assignments).toHaveLength(2);
      expect(inA.body.recentResults).toHaveLength(4);

      // Team B: exactly its own single assignment / event / result — no team A bleed.
      expect(inB.body.assignments).toHaveLength(1);
      expect(inB.body.assignments[0].opponentSnapshotLabel).toBe("vs Kano (B)");
      expect(
        inB.body.upcomingEvents.map((row: { event: { name: string } }) => row.event.name),
      ).toEqual(["Rival Cup"]);
      expect(inB.body.recentResults).toHaveLength(1);
    });

    it("renders empty states for a team with no data (no errors)", async () => {
      const response = await asMemberA(http().get("/api/dashboard/me"), teamEmpty.id);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ assignments: [], upcomingEvents: [], recentResults: [] });
    });
  });

  describe("GET /api/dashboard/team", () => {
    it("targets the nearest upcoming event and ranks what to test next per opponent", async () => {
      const response = await asMemberA(http().get("/api/dashboard/team"), teamA.id);
      expect(response.status).toBe(200);
      expect(response.body.targetEvent.name).toBe("Nationals");

      const recommendation = response.body.recommendation;
      expect(recommendation.map((row: { opponentLabel: string }) => row.opponentLabel)).toEqual([
        "Kano",
        "Fang Reference",
        "Aggro Red",
      ]);
      // Kano: normalizedShare 0.6 × coverageGap 1 (untested) = 0.6.
      expect(recommendation[0].priorityScore).toBe(0.6);
      expect(recommendation[0].effectiveSample).toBe(0);
    });

    it("lists coverage gaps with the members currently assigned to each", async () => {
      const response = await asMemberA(http().get("/api/dashboard/team"), teamA.id);
      const gaps = response.body.coverageGaps as {
        gauntletEntryId: string;
        assignees: string[];
      }[];
      const kanoGap = gaps.find((gap) => gap.gauntletEntryId === gauntletKanoA.id);
      const fangGap = gaps.find((gap) => gap.gauntletEntryId === gauntletFangA.id);
      const aggroGap = gaps.find((gap) => gap.gauntletEntryId === gauntletAggroA.id);
      expect(kanoGap?.assignees).toEqual(["Member A"]);
      expect(fangGap?.assignees).toEqual(["Member A"]);
      // The Aggro assignment is done, so it no longer counts as an active assignee.
      expect(aggroGap?.assignees).toEqual([]);
    });

    it("honors an explicit eventId that matches the active team", async () => {
      const response = await asMemberA(
        http().get(`/api/dashboard/team?eventId=${eventA.id}`),
        teamA.id,
      );
      expect(response.status).toBe(200);
      expect(response.body.targetEvent.id).toBe(eventA.id);
    });

    it("only counts the active team's recent results", async () => {
      const response = await asMemberA(http().get("/api/dashboard/team"), teamA.id);
      // Four team A logs; team B's game must not appear.
      expect(response.body.recentResults).toHaveLength(4);
    });

    it("returns an empty overview for a team with no upcoming event", async () => {
      const response = await asMemberA(http().get("/api/dashboard/team"), teamEmpty.id);
      expect(response.status).toBe(200);
      expect(response.body.targetEvent).toBeNull();
      expect(response.body.recommendation).toEqual([]);
      expect(response.body.coverageGaps).toEqual([]);
    });
  });

  describe("Tenant isolation", () => {
    it("requires authentication (401)", async () => {
      const response = await http().get("/api/dashboard/me").set("x-team-id", teamA.id);
      expect(response.status).toBe(401);
    });

    it("rejects a forged team the member does not belong to (403)", async () => {
      const me = await asMemberA(http().get("/api/dashboard/me"), teamC.id);
      expect(me.status).toBe(403);
      const team = await asMemberA(http().get("/api/dashboard/team"), teamC.id);
      expect(team.status).toBe(403);
    });

    it("returns 404 for a cross-tenant eventId (no enumeration)", async () => {
      const response = await asMemberA(
        http().get(`/api/dashboard/team?eventId=${eventB.id}`),
        teamA.id,
      );
      expect(response.status).toBe(404);
    });
  });
});
