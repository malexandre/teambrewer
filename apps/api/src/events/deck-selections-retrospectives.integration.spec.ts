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
 * Endpoint tests for the two phase-09 event sub-resources: deck selections (with the
 * team-admin lock state machine) and the post-event retrospective. The critical
 * properties are the lock permissions (only a team-admin locks/unlocks; a member cannot
 * edit a locked selection) and tenant isolation (a team never reaches another team's
 * event, so its selections/retrospective are unreachable too).
 */
describe("Deck selection & retrospective endpoints (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let teamA: TestTeam;
  let teamB: TestTeam;
  let adminA: TestUser;
  let memberA: TestUser;
  let memberB: TestUser;

  let fabFormatId: string;
  let eventA: TestEvent;
  let eventB: TestEvent;
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
    eventA = await createEvent(prisma, { teamId: teamA.id, formatId: fabFormatId });
    eventB = await createEvent(prisma, { teamId: teamB.id, formatId: fabFormatId });
    deckA = await createDeck(prisma, {
      teamId: teamA.id,
      ownerId: memberA.id,
      formatId: fabFormatId,
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
  const asAdminA = (req: request.Test) =>
    req.set("x-test-user-id", adminA.id).set("x-team-id", teamA.id);
  const asMemberB = (req: request.Test) =>
    req.set("x-test-user-id", memberB.id).set("x-team-id", teamB.id);

  describe("PUT /api/events/:eventId/deck-selections/me", () => {
    it("upserts the caller's own selection, stamping userId server-side", async () => {
      const response = await asMemberA(
        http().put(`/api/events/${eventA.id}/deck-selections/me`),
      ).send({ deckId: deckA.id, reasoning: "Best vs the aggro field." });
      expect(response.status).toBe(200);
      expect(response.body.member.userId).toBe(memberA.id);
      expect(response.body.deckId).toBe(deckA.id);
      expect(response.body.locked).toBe(false);
      expect(response.body.deckFormatId).toBe(fabFormatId);

      // A second PUT updates in place (same row).
      const update = await asMemberA(
        http().put(`/api/events/${eventA.id}/deck-selections/me`),
      ).send({ deckId: deckA.id, reasoning: "Revised." });
      expect(update.body.id).toBe(response.body.id);
      expect(update.body.reasoning).toBe("Revised.");
    });

    it("rejects a deck from another team (cross-team FK → 422)", async () => {
      const response = await asMemberA(
        http().put(`/api/events/${eventA.id}/deck-selections/me`),
      ).send({ deckId: deckB.id });
      expect(response.status).toBe(422);
    });
  });

  describe("lock permissions", () => {
    it("rejects a non-admin locking a selection (→ 403)", async () => {
      const created = await asMemberA(
        http().put(`/api/events/${eventA.id}/deck-selections/me`),
      ).send({ deckId: deckA.id });
      const lock = await asMemberA(
        http().patch(`/api/events/${eventA.id}/deck-selections/${created.body.id}/lock`),
      );
      expect(lock.status).toBe(403);
    });

    it("lets a team-admin lock, then rejects the member's edit (→ 422), then unlock re-enables it", async () => {
      const created = await asMemberA(
        http().put(`/api/events/${eventA.id}/deck-selections/me`),
      ).send({ deckId: deckA.id, reasoning: "Initial." });
      const selectionId = created.body.id;

      const lock = await asAdminA(
        http().patch(`/api/events/${eventA.id}/deck-selections/${selectionId}/lock`),
      );
      expect(lock.status).toBe(200);
      expect(lock.body.locked).toBe(true);
      expect(lock.body.lockedAt).not.toBeNull();

      const blockedEdit = await asMemberA(
        http().put(`/api/events/${eventA.id}/deck-selections/me`),
      ).send({ deckId: deckA.id, reasoning: "Sneaky change." });
      expect(blockedEdit.status).toBe(422);
      expect(blockedEdit.body.error.code).toBe("DOMAIN_RULE_VIOLATION");

      const unlock = await asAdminA(
        http().patch(`/api/events/${eventA.id}/deck-selections/${selectionId}/unlock`),
      );
      expect(unlock.status).toBe(200);
      expect(unlock.body.locked).toBe(false);

      const allowedEdit = await asMemberA(
        http().put(`/api/events/${eventA.id}/deck-selections/me`),
      ).send({ deckId: deckA.id, reasoning: "Now allowed." });
      expect(allowedEdit.status).toBe(200);
      expect(allowedEdit.body.reasoning).toBe("Now allowed.");
    });

    it("rejects a non-admin unlocking a selection (→ 403)", async () => {
      const created = await asMemberA(
        http().put(`/api/events/${eventA.id}/deck-selections/me`),
      ).send({ deckId: deckA.id });
      await asAdminA(
        http().patch(`/api/events/${eventA.id}/deck-selections/${created.body.id}/lock`),
      );
      const unlock = await asMemberA(
        http().patch(`/api/events/${eventA.id}/deck-selections/${created.body.id}/unlock`),
      );
      expect(unlock.status).toBe(403);
    });
  });

  describe("GET /api/events/:eventId/deck-selections", () => {
    it("returns the roster for the event", async () => {
      await asMemberA(http().put(`/api/events/${eventA.id}/deck-selections/me`)).send({
        deckId: deckA.id,
      });
      const response = await asAdminA(http().get(`/api/events/${eventA.id}/deck-selections`));
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe("retrospective", () => {
    it("creates one retrospective per event and rejects a duplicate with 409", async () => {
      const created = await asMemberA(http().post(`/api/events/${eventA.id}/retrospective`)).send({
        body: "We went 5-2.",
        resultsSummary: "3rd of 32",
        learnings: "More interaction vs Briar.",
      });
      expect(created.status).toBe(201);
      expect(created.body.author.userId).toBe(memberA.id);
      expect(created.body.learnings).toBe("More interaction vs Briar.");

      const dup = await asAdminA(http().post(`/api/events/${eventA.id}/retrospective`)).send({
        body: "Second attempt.",
      });
      expect(dup.status).toBe(409);
    });

    it("returns 404 when no retrospective exists yet", async () => {
      const response = await asMemberA(http().get(`/api/events/${eventA.id}/retrospective`));
      expect(response.status).toBe(404);
    });

    it("lets the author edit and a team-admin archive; blocks a non-admin archive", async () => {
      const created = await asMemberA(http().post(`/api/events/${eventA.id}/retrospective`)).send({
        body: "Draft.",
      });
      const retroId = created.body.id;

      const edit = await asMemberA(
        http().patch(`/api/events/${eventA.id}/retrospective/${retroId}`),
      ).send({ body: "Edited by author." });
      expect(edit.status).toBe(200);
      expect(edit.body.body).toBe("Edited by author.");

      const memberArchive = await asMemberA(
        http().patch(`/api/events/${eventA.id}/retrospective/${retroId}`),
      ).send({ archived: true });
      expect(memberArchive.status).toBe(403);

      const adminArchive = await asAdminA(
        http().patch(`/api/events/${eventA.id}/retrospective/${retroId}`),
      ).send({ archived: true });
      expect(adminArchive.status).toBe(200);

      const gone = await asMemberA(http().get(`/api/events/${eventA.id}/retrospective`));
      expect(gone.status).toBe(404);
    });
  });

  describe("tenant isolation", () => {
    it("does not let team A reach team B's event deck-selections (cross-tenant → 404)", async () => {
      const response = await asMemberA(http().get(`/api/events/${eventB.id}/deck-selections`));
      expect(response.status).toBe(404);
    });

    it("does not let team A write a retrospective on team B's event (cross-tenant → 404)", async () => {
      const response = await asMemberA(http().post(`/api/events/${eventB.id}/retrospective`)).send({
        body: "Should not be allowed.",
      });
      expect(response.status).toBe(404);
    });

    it("rejects a forged X-Team-Id (→ 403)", async () => {
      const response = await http()
        .get(`/api/events/${eventB.id}/deck-selections`)
        .set("x-test-user-id", memberA.id)
        .set("x-team-id", teamB.id);
      expect(response.status).toBe(403);
    });

    it("scopes the roster read to the caller's team", async () => {
      await asMemberB(http().put(`/api/events/${eventB.id}/deck-selections/me`)).send({
        deckId: deckB.id,
      });
      const response = await asMemberB(http().get(`/api/events/${eventB.id}/deck-selections`));
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
    });
  });
});
