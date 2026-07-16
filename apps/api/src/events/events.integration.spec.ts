import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import {
  addMembership,
  createAttendance,
  createEvent,
  createGame,
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
 * Endpoint tests for the lightweight, isolated event + attendance surface (meta-pivot
 * redesign, WS-5). The critical properties are tenant isolation (a team never reaches
 * another team's events/RSVPs), soft-delete on archive, and attendance idempotency
 * with the going/interested RSVP. A two-team Flesh and Blood world backs the suite.
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
  });

  const http = () => request(app.getHttpServer());
  const asMemberA = (req: request.Test) =>
    req.set("x-test-user-id", memberA.id).set("x-team-id", teamA.id);
  const asMemberA2 = (req: request.Test) =>
    req.set("x-test-user-id", memberA2.id).set("x-team-id", teamA.id);

  const validEvent = () => ({
    name: "Calling: Sydney",
    date: "2026-09-12",
    location: "Sydney",
  });

  describe("POST /api/events", () => {
    it("creates an event, stamping teamId/gameId server-side", async () => {
      const response = await asMemberA(http().post("/api/events")).send({
        ...validEvent(),
        // A spoofed teamId in the body must be ignored.
        teamId: teamB.id,
      });
      expect(response.status).toBe(201);
      expect(response.body.name).toBe("Calling: Sydney");
      expect(response.body.gameId).toBe("flesh-and-blood");
      expect(response.body).not.toHaveProperty("metaId");
      expect(response.body.attendanceSummary).toEqual({ going: 0, interested: 0 });

      const persisted = await prisma.event.findUnique({ where: { id: response.body.id } });
      expect(persisted?.teamId).toBe(teamA.id);
    });

    it("rejects an invalid body (400)", async () => {
      const response = await asMemberA(http().post("/api/events")).send({ name: "" });
      expect(response.status).toBe(400);
    });

    it("requires authentication (401)", async () => {
      const response = await http()
        .post("/api/events")
        .set("x-team-id", teamA.id)
        .send(validEvent());
      expect(response.status).toBe(401);
    });

    it("rejects a forged team the member does not belong to (403)", async () => {
      const response = await http()
        .post("/api/events")
        .set("x-test-user-id", memberA.id)
        .set("x-team-id", teamB.id)
        .send(validEvent());
      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/events", () => {
    it("lists only the team's non-archived events", async () => {
      await createEvent(prisma, { teamId: teamA.id, name: "First" });
      await createEvent(prisma, { teamId: teamA.id, name: "Second" });
      await createEvent(prisma, { teamId: teamA.id, name: "Old", archivedAt: new Date() });
      // A team-B event must never appear.
      await createEvent(prisma, { teamId: teamB.id, name: "Bravo Event" });

      const all = await asMemberA(http().get("/api/events"));
      expect(all.status).toBe(200);
      expect(all.body.data).toHaveLength(2);
      expect(all.body.data.map((event: { name: string }) => event.name)).not.toContain(
        "Bravo Event",
      );
    });

    it("includes each event's going/interested RSVP counts", async () => {
      // Craft one event with 2 going + 1 interested, and a second, untouched event
      // so the counts are proven to be per-event (not a team-wide tally).
      const withRsvps = await createEvent(prisma, { teamId: teamA.id, name: "With RSVPs" });
      await createEvent(prisma, { teamId: teamA.id, name: "No RSVPs" });
      await createAttendance(prisma, {
        eventId: withRsvps.id,
        userId: adminA.id,
        status: "going",
      });
      await createAttendance(prisma, {
        eventId: withRsvps.id,
        userId: memberA.id,
        status: "going",
      });
      await createAttendance(prisma, {
        eventId: withRsvps.id,
        userId: memberA2.id,
        status: "interested",
      });

      const response = await asMemberA(http().get("/api/events"));
      expect(response.status).toBe(200);
      const rowsByName = new Map<string, { goingCount: number; interestedCount: number }>(
        response.body.data.map(
          (event: { name: string; goingCount: number; interestedCount: number }) => [
            event.name,
            { goingCount: event.goingCount, interestedCount: event.interestedCount },
          ],
        ),
      );
      expect(rowsByName.get("With RSVPs")).toEqual({ goingCount: 2, interestedCount: 1 });
      expect(rowsByName.get("No RSVPs")).toEqual({ goingCount: 0, interestedCount: 0 });
    });
  });

  describe("GET /api/events/:eventId", () => {
    it("returns the event with its attendance summary", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id });
      await createAttendance(prisma, { eventId: event.id, userId: memberA.id, status: "going" });
      await createAttendance(prisma, {
        eventId: event.id,
        userId: memberA2.id,
        status: "interested",
      });

      const response = await asMemberA(http().get(`/api/events/${event.id}`));
      expect(response.status).toBe(200);
      expect(response.body.attendanceSummary).toEqual({ going: 1, interested: 1 });
    });

    it("returns 404 for another team's event (no enumeration)", async () => {
      const eventB = await createEvent(prisma, { teamId: teamB.id });
      const response = await asMemberA(http().get(`/api/events/${eventB.id}`));
      expect(response.status).toBe(404);
    });

    it("returns 404 for an archived event", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id, archivedAt: new Date() });
      const response = await asMemberA(http().get(`/api/events/${event.id}`));
      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/events/:eventId", () => {
    it("updates fields and clears the location with null", async () => {
      const event = await createEvent(prisma, {
        teamId: teamA.id,
        location: "Sydney",
      });

      const response = await asMemberA(http().patch(`/api/events/${event.id}`)).send({
        name: "Renamed",
        location: null,
      });
      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Renamed");
      expect(response.body.location).toBeNull();
    });
  });

  describe("DELETE /api/events/:eventId", () => {
    it("soft-deletes (archives) the event", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id });
      const response = await asMemberA(http().delete(`/api/events/${event.id}`));
      expect(response.status).toBe(204);

      const persisted = await prisma.event.findUnique({ where: { id: event.id } });
      expect(persisted?.archivedAt).not.toBeNull();
      // It drops out of default reads.
      const read = await asMemberA(http().get(`/api/events/${event.id}`));
      expect(read.status).toBe(404);
    });
  });

  describe("attendance", () => {
    it("upserts my RSVP idempotently and lists the roster", async () => {
      const event = await createEvent(prisma, { teamId: teamA.id });

      const first = await asMemberA(http().put(`/api/events/${event.id}/attendance/me`)).send({
        status: "going",
      });
      expect(first.status).toBe(200);
      expect(first.body.status).toBe("going");

      // A second call for the same member updates in place (one row per member).
      const second = await asMemberA(http().put(`/api/events/${event.id}/attendance/me`)).send({
        status: "interested",
      });
      expect(second.status).toBe(200);
      expect(second.body.status).toBe("interested");

      await asMemberA2(http().put(`/api/events/${event.id}/attendance/me`)).send({
        status: "going",
      });

      const roster = await asMemberA(http().get(`/api/events/${event.id}/attendance`));
      expect(roster.status).toBe(200);
      expect(roster.body.data).toHaveLength(2);
    });

    it("returns 404 setting attendance on another team's event", async () => {
      const eventB = await createEvent(prisma, { teamId: teamB.id });
      const response = await asMemberA(http().put(`/api/events/${eventB.id}/attendance/me`)).send({
        status: "going",
      });
      expect(response.status).toBe(404);
    });
  });
});
