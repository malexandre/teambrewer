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
  createGauntletEntry,
  createHero,
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
 * Endpoint tests for events, gauntlets, and attendance. The critical properties
 * are tenant isolation (a team never reaches another team's events/entries/RSVPs),
 * the status lifecycle, the gauntlet target rules, and attendance idempotency. A
 * two-team Flesh and Blood world plus a Riftbound game (for cross-game FK
 * rejection) backs the suite.
 */
describe("Events endpoints (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let teamA: TestTeam;
  let teamB: TestTeam;
  let adminA: TestUser;
  let memberA: TestUser;
  let memberA2: TestUser;
  let memberB: TestUser;

  let fabFormatId: string;
  let fabFormatId2: string;
  let fabHeroId: string;
  let riftFormatId: string;
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

    fabFormatId = (
      await createFormat(prisma, {
        gameId: "flesh-and-blood",
        key: "cc",
        name: "Classic Constructed",
      })
    ).id;
    fabFormatId2 = (
      await createFormat(prisma, { gameId: "flesh-and-blood", key: "blitz", name: "Blitz" })
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

  const validEvent = () => ({
    name: "Calling: Sydney",
    formatId: fabFormatId,
    date: "2026-09-12",
    importance: "national",
  });

  describe("POST /api/events", () => {
    it("creates an event, stamping teamId server-side and starting it upcoming", async () => {
      const response = await asMemberA(http().post("/api/events")).send({
        ...validEvent(),
        // A spoofed teamId/status in the body must be ignored.
        teamId: teamB.id,
        status: "completed",
      });
      expect(response.status).toBe(201);
      expect(response.body.status).toBe("upcoming");
      expect(response.body.importance).toBe("national");
      expect(response.body.gauntletEntries).toEqual([]);
      expect(response.body.attendanceSummary).toEqual({ going: 0, maybe: 0, notGoing: 0 });

      const persisted = await prisma.event.findUnique({ where: { id: response.body.id } });
      expect(persisted?.teamId).toBe(teamA.id);
      expect(persisted?.status).toBe("upcoming");
    });

    it("rejects an event whose format belongs to another game (cross-game FK)", async () => {
      const response = await asMemberA(http().post("/api/events")).send({
        ...validEvent(),
        formatId: riftFormatId,
      });
      expect(response.status).toBe(404);
    });

    it("rejects an invalid payload with 400", async () => {
      const response = await asMemberA(http().post("/api/events")).send({
        ...validEvent(),
        importance: "worlds",
      });
      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/events", () => {
    it("lists the team's non-archived events and filters by status/format/importance", async () => {
      await createEvent(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        importance: "major",
        status: "active",
      });
      await createEvent(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId2,
        importance: "local",
        status: "upcoming",
      });
      await createEvent(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        status: "upcoming",
        archivedAt: new Date(),
      });
      // Another team's event must never appear.
      await createEvent(prisma, { teamId: teamB.id, formatId: fabFormatId });

      const all = await asMemberA(http().get("/api/events"));
      expect(all.status).toBe(200);
      expect(all.body.data).toHaveLength(2);

      const active = await asMemberA(http().get("/api/events?status=active"));
      expect(active.body.data).toHaveLength(1);
      expect(active.body.data[0].status).toBe("active");

      const byFormat = await asMemberA(http().get(`/api/events?formatId=${fabFormatId2}`));
      expect(byFormat.body.data).toHaveLength(1);

      const major = await asMemberA(http().get("/api/events?importance=major"));
      expect(major.body.data).toHaveLength(1);
      expect(major.body.data[0].importance).toBe("major");
    });

    it("paginates with a keyset cursor", async () => {
      for (let index = 0; index < 3; index += 1) {
        await createEvent(prisma, {
          teamId: teamA.id,
          formatId: fabFormatId,
          date: new Date(`2026-0${index + 1}-01T00:00:00.000Z`),
        });
      }
      const firstPage = await asMemberA(http().get("/api/events?limit=2"));
      expect(firstPage.body.data).toHaveLength(2);
      expect(firstPage.body.nextCursor).not.toBeNull();

      const secondPage = await asMemberA(
        http().get(`/api/events?limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`),
      );
      expect(secondPage.body.data).toHaveLength(1);
      expect(secondPage.body.nextCursor).toBeNull();
    });
  });

  describe("GET /api/events/:eventId", () => {
    it("returns detail with the embedded gauntlet + attendance summary", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id, formatId: fabFormatId });
      await createGauntletEntry(prisma, {
        eventId: event.id,
        teamId: teamA.id,
        heroId: fabHeroId,
        expectedMetaShare: 40,
      });

      const response = await asMemberA(http().get(`/api/events/${event.id}`));
      expect(response.status).toBe(200);
      expect(response.body.gauntletEntries).toHaveLength(1);
      expect(response.body.gauntletEntries[0].heroId).toBe(fabHeroId);
    });

    it("returns 404 for an archived event", async () => {
      const event = await createEvent(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        archivedAt: new Date(),
        status: "archived",
      });
      const response = await asMemberA(http().get(`/api/events/${event.id}`));
      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/events/:eventId", () => {
    it("updates fields and advances status through a legal transition", async () => {
      const event = await createEvent(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        status: "upcoming",
      });
      const rename = await asMemberA(http().patch(`/api/events/${event.id}`)).send({
        name: "Calling: Melbourne",
      });
      expect(rename.status).toBe(200);
      expect(rename.body.name).toBe("Calling: Melbourne");

      const advance = await asMemberA(http().patch(`/api/events/${event.id}`)).send({
        status: "active",
      });
      expect(advance.status).toBe(200);
      expect(advance.body.status).toBe("active");
    });

    it("rejects an illegal status transition with 422", async () => {
      const event = await createEvent(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        status: "upcoming",
      });
      const response = await asMemberA(http().patch(`/api/events/${event.id}`)).send({
        status: "completed",
      });
      expect(response.status).toBe(422);
    });

    it("archiving via a status advance stamps archivedAt and drops the event from lists", async () => {
      const event = await createEvent(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        status: "active",
      });
      const response = await asMemberA(http().patch(`/api/events/${event.id}`)).send({
        status: "archived",
      });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("archived");
      expect(response.body.archivedAt).not.toBeNull();

      const list = await asMemberA(http().get("/api/events"));
      expect(list.body.data).toHaveLength(0);
    });
  });

  describe("DELETE /api/events/:eventId", () => {
    it("archives an event (soft-delete) and returns 204", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id, formatId: fabFormatId });
      const response = await asMemberA(http().delete(`/api/events/${event.id}`));
      expect(response.status).toBe(204);

      const persisted = await prisma.event.findUnique({ where: { id: event.id } });
      expect(persisted?.status).toBe("archived");
      expect(persisted?.archivedAt).not.toBeNull();
    });
  });

  describe("Gauntlet entries", () => {
    it("adds entries for a reference deck, a hero, and an archetype label", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id, formatId: fabFormatId });
      const referenceDeck = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
        isReference: true,
      });

      const byDeck = await asMemberA(http().post(`/api/events/${event.id}/gauntlet-entries`)).send({
        referenceDeckId: referenceDeck.id,
        expectedMetaShare: 30,
      });
      expect(byDeck.status).toBe(201);
      expect(byDeck.body.referenceDeckId).toBe(referenceDeck.id);

      const byHero = await asMemberA(http().post(`/api/events/${event.id}/gauntlet-entries`)).send({
        heroId: fabHeroId,
        expectedMetaShare: 20,
      });
      expect(byHero.status).toBe(201);

      const byLabel = await asMemberA(http().post(`/api/events/${event.id}/gauntlet-entries`)).send(
        {
          archetypeLabel: "Aggro Red",
          expectedMetaShare: 10,
        },
      );
      expect(byLabel.status).toBe(201);

      const list = await asMemberA(http().get(`/api/events/${event.id}/gauntlet-entries`));
      expect(list.body.data).toHaveLength(3);
      // Sorted by expected share descending.
      expect(
        list.body.data.map((entry: { expectedMetaShare: number }) => entry.expectedMetaShare),
      ).toEqual([30, 20, 10]);
    });

    it("rejects zero or multiple target forms with 400", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id, formatId: fabFormatId });
      const none = await asMemberA(http().post(`/api/events/${event.id}/gauntlet-entries`)).send({
        expectedMetaShare: 10,
      });
      expect(none.status).toBe(400);
      const both = await asMemberA(http().post(`/api/events/${event.id}/gauntlet-entries`)).send({
        heroId: fabHeroId,
        archetypeLabel: "Aggro Red",
        expectedMetaShare: 10,
      });
      expect(both.status).toBe(400);
    });

    it("rejects an out-of-range expected share with 400", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id, formatId: fabFormatId });
      const response = await asMemberA(
        http().post(`/api/events/${event.id}/gauntlet-entries`),
      ).send({ heroId: fabHeroId, expectedMetaShare: 101 });
      expect(response.status).toBe(400);
    });

    it("rejects a duplicate target within one event with 422", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id, formatId: fabFormatId });
      await createGauntletEntry(prisma, {
        eventId: event.id,
        teamId: teamA.id,
        heroId: fabHeroId,
        expectedMetaShare: 25,
      });
      const response = await asMemberA(
        http().post(`/api/events/${event.id}/gauntlet-entries`),
      ).send({ heroId: fabHeroId, expectedMetaShare: 15 });
      expect(response.status).toBe(422);
    });

    it("rejects a reference deck that is not a reference deck with 422", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id, formatId: fabFormatId });
      const nonReferenceDeck = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
        isReference: false,
      });
      const response = await asMemberA(
        http().post(`/api/events/${event.id}/gauntlet-entries`),
      ).send({ referenceDeckId: nonReferenceDeck.id, expectedMetaShare: 30 });
      expect(response.status).toBe(422);
    });

    it("rejects a reference deck belonging to another team with 422 (no cross-team FK)", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id, formatId: fabFormatId });
      const teamBDeck = await createDeck(prisma, {
        teamId: teamB.id,
        ownerId: memberB.id,
        formatId: fabFormatId,
        isReference: true,
      });
      const response = await asMemberA(
        http().post(`/api/events/${event.id}/gauntlet-entries`),
      ).send({ referenceDeckId: teamBDeck.id, expectedMetaShare: 30 });
      expect(response.status).toBe(422);
    });

    it("updates a gauntlet entry's share (target is immutable) and removes it", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id, formatId: fabFormatId });
      const entry = await createGauntletEntry(prisma, {
        eventId: event.id,
        teamId: teamA.id,
        heroId: fabHeroId,
        expectedMetaShare: 25,
      });

      const updated = await asMemberA(
        http().patch(`/api/events/${event.id}/gauntlet-entries/${entry.id}`),
      ).send({ expectedMetaShare: 35 });
      expect(updated.status).toBe(200);
      expect(updated.body.expectedMetaShare).toBe(35);

      const changeTarget = await asMemberA(
        http().patch(`/api/events/${event.id}/gauntlet-entries/${entry.id}`),
      ).send({ heroId: riftHeroId });
      expect(changeTarget.status).toBe(400);

      const removed = await asMemberA(
        http().delete(`/api/events/${event.id}/gauntlet-entries/${entry.id}`),
      );
      expect(removed.status).toBe(204);
      const list = await asMemberA(http().get(`/api/events/${event.id}/gauntlet-entries`));
      expect(list.body.data).toHaveLength(0);
    });
  });

  describe("Attendance", () => {
    it("upserts my RSVP idempotently (a single row per member)", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id, formatId: fabFormatId });

      const first = await asMemberA(http().put(`/api/events/${event.id}/attendance/me`)).send({
        status: "going",
      });
      expect(first.status).toBe(200);
      expect(first.body.status).toBe("going");
      expect(first.body.user.userId).toBe(memberA.id);

      const second = await asMemberA(http().put(`/api/events/${event.id}/attendance/me`)).send({
        status: "maybe",
      });
      expect(second.status).toBe(200);
      expect(second.body.status).toBe("maybe");

      const rows = await prisma.attendance.findMany({ where: { eventId: event.id } });
      expect(rows).toHaveLength(1);

      const roster = await asMemberA(http().get(`/api/events/${event.id}/attendance`));
      expect(roster.body.data).toHaveLength(1);

      const detail = await asMemberA(http().get(`/api/events/${event.id}`));
      expect(detail.body.attendanceSummary).toEqual({ going: 0, maybe: 1, notGoing: 0 });
    });
  });

  describe("Collaboration attach", () => {
    it("emits create/update/status-change activity and accepts comments on an event", async () => {
      const created = await asMemberA(http().post("/api/events")).send(validEvent());
      const eventId = created.body.id;
      await asMemberA(http().patch(`/api/events/${eventId}`)).send({ name: "Renamed" });
      await asMemberA(http().patch(`/api/events/${eventId}`)).send({ status: "active" });

      const comment = await asMemberA(http().post("/api/comments")).send({
        subjectType: "event",
        subjectId: eventId,
        body: "Who is testing the top hero?",
      });
      expect(comment.status).toBe(201);

      const perSubject = await asMemberA(
        http().get("/api/activity").query({ subjectType: "event", subjectId: eventId }),
      );
      const verbs = perSubject.body.data.map((event: { verb: string }) => event.verb);
      expect(verbs).toContain("event_created");
      expect(verbs).toContain("event_updated");
      expect(verbs).toContain("event_status_changed");
      expect(verbs).toContain("commented");
      expect(
        perSubject.body.data.every((event: { subjectId: string }) => event.subjectId === eventId),
      ).toBe(true);

      const thread = await asMemberA(
        http().get("/api/comments").query({ subjectType: "event", subjectId: eventId }),
      );
      expect(thread.body.data).toHaveLength(1);
    });

    it("refuses new comments on an archived event (422)", async () => {
      const event = await createEvent(prisma, {
        teamId: teamA.id,
        formatId: fabFormatId,
        status: "archived",
        archivedAt: new Date(),
      });
      const response = await asMemberA(http().post("/api/comments")).send({
        subjectType: "event",
        subjectId: event.id,
        body: "late comment",
      });
      expect(response.status).toBe(422);
    });

    it("returns 404 commenting on / reading activity for another team's event", async () => {
      const eventB = await createEvent(prisma, { teamId: teamB.id, formatId: fabFormatId });
      const comment = await asMemberA(http().post("/api/comments")).send({
        subjectType: "event",
        subjectId: eventB.id,
        body: "cross-tenant",
      });
      const activity = await asMemberA(
        http().get("/api/activity").query({ subjectType: "event", subjectId: eventB.id }),
      );
      expect([comment.status, activity.status]).toEqual([404, 404]);
    });
  });

  describe("Tenant isolation (mandatory)", () => {
    it("returns 404 when a team-A user reads a team-B event/entry/attendance", async () => {
      const eventB = await createEvent(prisma, { teamId: teamB.id, formatId: fabFormatId });
      const entryB = await createGauntletEntry(prisma, {
        eventId: eventB.id,
        teamId: teamB.id,
        heroId: fabHeroId,
        expectedMetaShare: 20,
      });

      const getEvent = await asMemberA(http().get(`/api/events/${eventB.id}`));
      const listEntries = await asMemberA(http().get(`/api/events/${eventB.id}/gauntlet-entries`));
      const listAttendance = await asMemberA(http().get(`/api/events/${eventB.id}/attendance`));
      const updateEntry = await asMemberA(
        http().patch(`/api/events/${eventB.id}/gauntlet-entries/${entryB.id}`),
      ).send({ expectedMetaShare: 99 });
      expect([
        getEvent.status,
        listEntries.status,
        listAttendance.status,
        updateEntry.status,
      ]).toEqual([404, 404, 404, 404]);
    });

    it("returns 404 (never mutates) when a team-A user writes to a team-B event", async () => {
      const eventB = await createEvent(prisma, {
        teamId: teamB.id,
        formatId: fabFormatId,
        name: "Bravo Calling",
        status: "upcoming",
      });

      const update = await asMemberA(http().patch(`/api/events/${eventB.id}`)).send({
        name: "Hijacked",
      });
      const archive = await asMemberA(http().delete(`/api/events/${eventB.id}`));
      const addEntry = await asMemberA(
        http().post(`/api/events/${eventB.id}/gauntlet-entries`),
      ).send({
        heroId: fabHeroId,
        expectedMetaShare: 10,
      });
      const rsvp = await asMemberA(http().put(`/api/events/${eventB.id}/attendance/me`)).send({
        status: "going",
      });
      expect([update.status, archive.status, addEntry.status, rsvp.status]).toEqual([
        404, 404, 404, 404,
      ]);

      const untouched = await prisma.event.findUnique({ where: { id: eventB.id } });
      expect(untouched?.name).toBe("Bravo Calling");
      expect(untouched?.archivedAt).toBeNull();
      const entries = await prisma.gauntletEntry.findMany({ where: { eventId: eventB.id } });
      expect(entries).toHaveLength(0);
      const rsvps = await prisma.attendance.findMany({ where: { eventId: eventB.id } });
      expect(rsvps).toHaveLength(0);
    });

    it("returns 403 for a forged team the caller is not a member of", async () => {
      const eventA = await createEvent(prisma, { teamId: teamA.id, formatId: fabFormatId });
      // memberB forges team A's id but is only a member of team B.
      const response = await http()
        .get(`/api/events/${eventA.id}`)
        .set("x-test-user-id", memberB.id)
        .set("x-team-id", teamA.id);
      expect(response.status).toBe(403);
    });
  });

  describe("Shared team board permissions", () => {
    it("lets any team member — not just the creator or an admin — edit and delete an event", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id, formatId: fabFormatId });
      // memberA2 did not create the event, and is not an admin.
      const edited = await asMemberA2(http().patch(`/api/events/${event.id}`)).send({
        name: "Edited by a teammate",
      });
      expect(edited.status).toBe(200);
      const archived = await asAdminA(http().delete(`/api/events/${event.id}`));
      expect(archived.status).toBe(204);
    });
  });
});
