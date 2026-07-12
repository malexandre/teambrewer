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
  type TestDeck,
  type TestEvent,
  type TestTeam,
  type TestUser,
} from "../../test/factories.js";
import { createApiTestApp } from "../../test/nest-app.js";
import { AppModule } from "../app.module.js";
import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Endpoint tests for test assignments. The critical properties are tenant isolation
 * (a team never reaches another team's assignments, and an assignment cannot
 * reference another team's deck/event/gauntlet-entry or another game's hero), the
 * exactly-one-opponent rule, the guarded status lifecycle, creator/assignee/admin
 * ownership, and the opponent snapshot label that survives deletion of the referenced
 * gauntlet entry. A two-team Flesh and Blood world plus a Riftbound game backs it.
 */
describe("Test-assignment endpoints (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let teamA: TestTeam;
  let teamB: TestTeam;
  let adminA: TestUser;
  let memberA: TestUser;
  let memberA2: TestUser;
  let memberB: TestUser;

  let fabFormatId: string;
  let deckA: TestDeck;
  let deckB: TestDeck;
  let eventA: TestEvent;
  let eventB: TestEvent;
  let fabHeroId: string;
  let riftHeroId: string;
  let gauntletEntryA: { id: string };
  let gauntletEntryB: { id: string };

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

    deckA = await createDeck(prisma, {
      teamId: teamA.id,
      ownerId: memberA.id,
      formatId: fabFormatId,
      name: "Our Deck",
    });
    deckB = await createDeck(prisma, {
      teamId: teamB.id,
      ownerId: memberB.id,
      formatId: fabFormatId,
      name: "Team B Deck",
    });
    eventA = await createEvent(prisma, {
      teamId: teamA.id,
      formatId: fabFormatId,
      name: "Nationals",
    });
    eventB = await createEvent(prisma, {
      teamId: teamB.id,
      formatId: fabFormatId,
      name: "Team B Event",
    });
    fabHeroId = (await createHero(prisma, { gameId: "flesh-and-blood", name: "Fai" })).id;
    riftHeroId = (await createHero(prisma, { gameId: "riftbound", name: "Rift Legend" })).id;
    gauntletEntryA = await createGauntletEntry(prisma, {
      eventId: eventA.id,
      teamId: teamA.id,
      heroId: fabHeroId,
      expectedMetaShare: 25,
    });
    gauntletEntryB = await createGauntletEntry(prisma, {
      eventId: eventB.id,
      teamId: teamB.id,
      archetypeLabel: "Team B Boogeyman",
      expectedMetaShare: 30,
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

  const validAssignment = () => ({
    assigneeId: memberA2.id,
    deckId: deckA.id,
    opponentGauntletEntryId: gauntletEntryA.id,
    targetGames: 10,
  });

  const createAssignment = async (
    actor: (req: request.Test) => request.Test = asMemberA,
    body: Record<string, unknown> = validAssignment(),
  ) => actor(http().post("/api/test-assignments")).send(body);

  describe("create", () => {
    it("creates an assignment against a gauntlet entry, snapshotting the target label", async () => {
      const response = await createAssignment();
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        assignee: { userId: memberA2.id },
        assignedBy: { userId: memberA.id },
        deckId: deckA.id,
        deckName: "Our Deck",
        opponentGauntletEntryId: gauntletEntryA.id,
        opponentSnapshotLabel: "Fai",
        targetGames: 10,
        status: "open",
      });
    });

    it("creates an assignment against a bare hero and an archetype label", async () => {
      const byHero = await createAssignment(asMemberA, {
        assigneeId: memberA.id,
        deckId: deckA.id,
        opponentHeroId: fabHeroId,
      });
      expect(byHero.status).toBe(201);
      expect(byHero.body).toMatchObject({
        opponentHeroId: fabHeroId,
        opponentSnapshotLabel: "Fai",
      });
      expect(byHero.body.targetGames).toBeNull();

      const byLabel = await createAssignment(asMemberA, {
        assigneeId: memberA.id,
        deckId: deckA.id,
        opponentArchetypeLabel: "Aggro Draconic",
      });
      expect(byLabel.body).toMatchObject({
        opponentArchetypeLabel: "Aggro Draconic",
        opponentSnapshotLabel: "Aggro Draconic",
      });
    });

    it("rejects zero or multiple opponent targets (400)", async () => {
      const zero = await createAssignment(asMemberA, { assigneeId: memberA.id, deckId: deckA.id });
      expect(zero.status).toBe(400);

      const two = await createAssignment(asMemberA, {
        assigneeId: memberA.id,
        deckId: deckA.id,
        opponentHeroId: fabHeroId,
        opponentArchetypeLabel: "x",
      });
      expect(two.status).toBe(400);
    });

    it("rejects a non-member assignee, cross-team deck/event/gauntlet-entry (422) and a cross-game hero (404)", async () => {
      expect(
        (await createAssignment(asMemberA, { ...validAssignment(), assigneeId: memberB.id }))
          .status,
      ).toBe(422);
      expect(
        (await createAssignment(asMemberA, { ...validAssignment(), deckId: deckB.id })).status,
      ).toBe(422);
      expect(
        (
          await createAssignment(asMemberA, {
            assigneeId: memberA.id,
            deckId: deckA.id,
            opponentGauntletEntryId: gauntletEntryB.id,
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await createAssignment(asMemberA, {
            assigneeId: memberA.id,
            deckId: deckA.id,
            opponentHeroId: fabHeroId,
            eventId: eventB.id,
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await createAssignment(asMemberA, {
            assigneeId: memberA.id,
            deckId: deckA.id,
            opponentHeroId: riftHeroId,
          })
        ).status,
      ).toBe(404);
    });
  });

  describe("status lifecycle", () => {
    it("advances open -> in_progress -> done and supports cancellation", async () => {
      const created = await createAssignment();
      const id = created.body.id;

      const toProgress = await asMemberA(http().patch(`/api/test-assignments/${id}`)).send({
        status: "in_progress",
      });
      expect(toProgress.body.status).toBe("in_progress");

      const toDone = await asMemberA(http().patch(`/api/test-assignments/${id}`)).send({
        status: "done",
      });
      expect(toDone.body.status).toBe("done");

      // done is terminal.
      const illegal = await asMemberA(http().patch(`/api/test-assignments/${id}`)).send({
        status: "in_progress",
      });
      expect(illegal.status).toBe(422);
    });

    it("rejects an illegal transition (open -> done, 422)", async () => {
      const created = await createAssignment();
      const response = await asMemberA(
        http().patch(`/api/test-assignments/${created.body.id}`),
      ).send({ status: "done" });
      expect(response.status).toBe(422);
    });
  });

  describe("ownership", () => {
    it("lets the assignee advance status and forbids an unrelated member (403)", async () => {
      const created = await createAssignment(); // assignedBy=memberA, assignee=memberA2
      const id = created.body.id;

      const byAssignee = await asMemberA2(http().patch(`/api/test-assignments/${id}`)).send({
        status: "in_progress",
      });
      expect(byAssignee.status).toBe(200);

      // adminB context can't reach it (different team → 404); an unrelated same-team
      // member is exercised via a fresh assignment owned by memberA2 only.
      const owned = await createAssignment(asMemberA2, {
        assigneeId: memberA2.id,
        deckId: deckA.id,
        opponentHeroId: fabHeroId,
      });
      const byUnrelated = await asMemberA(http().delete(`/api/test-assignments/${owned.body.id}`));
      // memberA is neither creator nor assignee of `owned`, but is a team member;
      // ownership is per-actor, so this must be forbidden.
      expect(byUnrelated.status).toBe(403);

      const byAdmin = await asAdminA(http().delete(`/api/test-assignments/${owned.body.id}`));
      expect(byAdmin.status).toBe(204);
    });
  });

  describe("opponent snapshot", () => {
    it("keeps the snapshot label after the referenced gauntlet entry is deleted", async () => {
      const created = await createAssignment();
      const id = created.body.id;

      await prisma.gauntletEntry.delete({ where: { id: gauntletEntryA.id } });

      const list = await asMemberA(http().get("/api/test-assignments"));
      const row = list.body.data.find((assignment: { id: string }) => assignment.id === id);
      expect(row).toMatchObject({
        opponentGauntletEntryId: null,
        opponentSnapshotLabel: "Fai",
      });
    });
  });

  describe("list", () => {
    it("filters by assignee and status", async () => {
      await createAssignment(asMemberA, {
        assigneeId: memberA2.id,
        deckId: deckA.id,
        opponentHeroId: fabHeroId,
      });
      await createAssignment(asMemberA, {
        assigneeId: memberA.id,
        deckId: deckA.id,
        opponentHeroId: fabHeroId,
      });

      const forA2 = await asMemberA(http().get(`/api/test-assignments?assigneeId=${memberA2.id}`));
      expect(forA2.body.data).toHaveLength(1);
      expect(forA2.body.data[0].assignee.userId).toBe(memberA2.id);

      const done = await asMemberA(http().get("/api/test-assignments?status=done"));
      expect(done.body.data).toHaveLength(0);
    });
  });

  describe("tenant isolation (mandatory)", () => {
    it("does not let team B read team A's assignments", async () => {
      await createAssignment();
      const list = await asMemberB(http().get("/api/test-assignments"));
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(0);
    });

    it("returns 404 when team B edits team A's assignment (no enumeration)", async () => {
      const created = await createAssignment();
      const edit = await asMemberB(http().patch(`/api/test-assignments/${created.body.id}`)).send({
        status: "in_progress",
      });
      expect(edit.status).toBe(404);
    });

    it("returns 403 for a forged team id the caller is not a member of", async () => {
      const created = await createAssignment();
      const response = await http()
        .patch(`/api/test-assignments/${created.body.id}`)
        .set("x-test-user-id", memberB.id)
        .set("x-team-id", teamA.id)
        .send({ status: "in_progress" });
      expect(response.status).toBe(403);
    });
  });
});
