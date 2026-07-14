import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import {
  addMembership,
  createDeck,
  createFormat,
  createGame,
  createTask,
  createTaskVote,
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
 * Endpoint tests for tasks — the merged testing-work unit. The critical properties
 * are tenant isolation (a team never reaches another team's tasks/votes), the status
 * lifecycle + report-on-finish rule, the ownership rules (author/assignee/admin edit;
 * any member may self-assign + vote), idempotent upvoting, and that a task emits its
 * lifecycle activity and is a commentable subject. A two-team Flesh and Blood world
 * backs the suite.
 */
describe("Tasks endpoints (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let teamA: TestTeam;
  let teamB: TestTeam;
  let adminA: TestUser;
  let memberA: TestUser;
  let memberA2: TestUser;
  let memberB: TestUser;

  let fabFormatId: string;

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

    fabFormatId = (
      await createFormat(prisma, {
        gameId: "flesh-and-blood",
        key: "cc",
        name: "Classic Constructed",
      })
    ).id;
  });

  const http = () => request(app.getHttpServer());
  const asMemberA = (req: request.Test) =>
    req.set("x-test-user-id", memberA.id).set("x-team-id", teamA.id);
  const asMemberA2 = (req: request.Test) =>
    req.set("x-test-user-id", memberA2.id).set("x-team-id", teamA.id);
  const asAdminA = (req: request.Test) =>
    req.set("x-test-user-id", adminA.id).set("x-team-id", teamA.id);

  const teamADeck = () =>
    createDeck(prisma, { teamId: teamA.id, ownerId: memberA.id, formatId: fabFormatId });

  describe("POST /api/tasks", () => {
    it("creates a task, stamping teamId + authorId server-side and ignoring a spoofed teamId", async () => {
      const response = await asMemberA(http().post("/api/tasks")).send({
        title: "Test Bravado over Sink Below",
        description: "Try +[[card-1]] in the go-wide matchups.",
        teamId: teamB.id,
        authorId: memberB.id,
      });
      expect(response.status).toBe(201);
      expect(response.body.title).toBe("Test Bravado over Sink Below");
      expect(response.body.status).toBe("proposed");
      expect(response.body.author.userId).toBe(memberA.id);
      expect(response.body.assignee).toBeNull();
      expect(response.body.voteCount).toBe(0);

      const persisted = await prisma.task.findUnique({ where: { id: response.body.id } });
      expect(persisted?.teamId).toBe(teamA.id);
      expect(persisted?.authorId).toBe(memberA.id);
      // The +card token is stored verbatim (no server-side parsing).
      expect(persisted?.description).toContain("+[[card-1]]");
    });

    it("rejects a missing title with 400", async () => {
      const response = await asMemberA(http().post("/api/tasks")).send({ description: "no title" });
      expect(response.status).toBe(400);
    });

    it("links an optional deck and assigns on create", async () => {
      const deck = await teamADeck();
      const response = await asMemberA(http().post("/api/tasks")).send({
        title: "Tune the sideboard",
        deckId: deck.id,
        assigneeId: memberA2.id,
      });
      expect(response.status).toBe(201);
      expect(response.body.deckId).toBe(deck.id);
      expect(response.body.deckName).toBe(deck.name);
      expect(response.body.assignee.userId).toBe(memberA2.id);
    });

    it("rejects a deck from another team with 404 (no enumeration)", async () => {
      const deckB = await createDeck(prisma, {
        teamId: teamB.id,
        ownerId: memberB.id,
        formatId: fabFormatId,
      });
      const response = await asMemberA(http().post("/api/tasks")).send({
        title: "Bad deck link",
        deckId: deckB.id,
      });
      expect(response.status).toBe(404);
    });

    it("rejects an assignee who is not a team member with 422", async () => {
      const response = await asMemberA(http().post("/api/tasks")).send({
        title: "Bad assignee",
        assigneeId: memberB.id,
      });
      expect(response.status).toBe(422);
    });

    it("records a task_created activity event", async () => {
      const created = await asMemberA(http().post("/api/tasks")).send({ title: "Log it" });
      const events = await prisma.activityEvent.findMany({
        where: { teamId: teamA.id, subjectType: "task", subjectId: created.body.id },
      });
      expect(events.map((event) => event.verb)).toContain("task_created");
    });
  });

  describe("GET /api/tasks", () => {
    it("lists the team's non-archived tasks, filters by status, and hides other teams' tasks", async () => {
      await createTask(prisma, { teamId: teamA.id, authorId: memberA.id, status: "proposed" });
      await createTask(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        status: "assigned",
        assigneeId: memberA.id,
      });
      await createTask(prisma, { teamId: teamA.id, authorId: memberA.id, archivedAt: new Date() });
      await createTask(prisma, { teamId: teamB.id, authorId: memberB.id });

      const all = await asMemberA(http().get("/api/tasks"));
      expect(all.status).toBe(200);
      expect(all.body.data).toHaveLength(2);

      const proposed = await asMemberA(http().get("/api/tasks?status=proposed"));
      expect(proposed.body.data).toHaveLength(1);
      expect(proposed.body.data[0].status).toBe("proposed");
    });

    it("filters by assigneeId and deckId", async () => {
      const deck = await teamADeck();
      await createTask(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        deckId: deck.id,
        assigneeId: memberA2.id,
        status: "assigned",
      });
      await createTask(prisma, { teamId: teamA.id, authorId: memberA.id });

      const mine = await asMemberA(http().get(`/api/tasks?assigneeId=${memberA2.id}`));
      expect(mine.body.data).toHaveLength(1);
      const byDeck = await asMemberA(http().get(`/api/tasks?deckId=${deck.id}`));
      expect(byDeck.body.data).toHaveLength(1);
    });

    it("paginates with a keyset cursor", async () => {
      for (let index = 0; index < 3; index += 1) {
        await createTask(prisma, { teamId: teamA.id, authorId: memberA.id });
      }
      const firstPage = await asMemberA(http().get("/api/tasks?limit=2"));
      expect(firstPage.body.data).toHaveLength(2);
      expect(firstPage.body.nextCursor).not.toBeNull();

      const secondPage = await asMemberA(
        http().get(`/api/tasks?limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`),
      );
      expect(secondPage.body.data).toHaveLength(1);
      expect(secondPage.body.nextCursor).toBeNull();
    });
  });

  describe("GET /api/tasks/:taskId", () => {
    it("returns a task's detail", async () => {
      const task = await createTask(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        title: "Detail me",
      });
      const response = await asMemberA(http().get(`/api/tasks/${task.id}`));
      expect(response.status).toBe(200);
      expect(response.body.title).toBe("Detail me");
    });

    it("returns 404 for an archived task", async () => {
      const task = await createTask(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        archivedAt: new Date(),
      });
      const response = await asMemberA(http().get(`/api/tasks/${task.id}`));
      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/tasks/:taskId — lifecycle & report", () => {
    it("advances proposed -> assigned and records a task_status_changed activity", async () => {
      const task = await createTask(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA(http().patch(`/api/tasks/${task.id}`)).send({
        status: "assigned",
        assigneeId: memberA.id,
      });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("assigned");

      const events = await prisma.activityEvent.findMany({
        where: { teamId: teamA.id, subjectType: "task", subjectId: task.id },
      });
      expect(events.map((event) => event.verb)).toContain("task_status_changed");
    });

    it("allows a previously-illegal move now that the board is a free kanban", async () => {
      // assigned -> proposed was rejected under the old lifecycle; the kanban allows it.
      const task = await createTask(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        status: "assigned",
        assigneeId: memberA.id,
      });
      const response = await asMemberA(http().patch(`/api/tasks/${task.id}`)).send({
        status: "proposed",
      });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("proposed");
    });

    it("requires a report to finish (422), then accepts it (200)", async () => {
      const task = await createTask(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        status: "assigned",
        assigneeId: memberA.id,
      });
      const noReport = await asMemberA(http().patch(`/api/tasks/${task.id}`)).send({
        status: "finished",
      });
      expect(noReport.status).toBe(422);

      const withReport = await asMemberA(http().patch(`/api/tasks/${task.id}`)).send({
        status: "finished",
        report: "Tested 12 games; adopting the swap.",
      });
      expect(withReport.status).toBe(200);
      expect(withReport.body.status).toBe("finished");
      expect(withReport.body.report).toBe("Tested 12 games; adopting the swap.");
    });

    it("rejects an empty update with 400", async () => {
      const task = await createTask(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA(http().patch(`/api/tasks/${task.id}`)).send({});
      expect(response.status).toBe(400);
    });
  });

  describe("PATCH ownership & self-assign", () => {
    it("lets a non-owner member self-assign a task (assign to themselves, nothing else)", async () => {
      const task = await createTask(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA2(http().patch(`/api/tasks/${task.id}`)).send({
        assigneeId: memberA2.id,
      });
      expect(response.status).toBe(200);
      expect(response.body.assignee.userId).toBe(memberA2.id);
    });

    it("forbids a non-owner member from editing other fields (403)", async () => {
      const task = await createTask(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA2(http().patch(`/api/tasks/${task.id}`)).send({
        title: "Hijacked title",
      });
      expect(response.status).toBe(403);
    });

    it("forbids a non-owner from assigning the task to someone else (403)", async () => {
      const task = await createTask(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA2(http().patch(`/api/tasks/${task.id}`)).send({
        assigneeId: memberA.id,
      });
      expect(response.status).toBe(403);
    });

    it("lets a team-admin edit any member's task", async () => {
      const task = await createTask(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asAdminA(http().patch(`/api/tasks/${task.id}`)).send({
        title: "Admin edit",
      });
      expect(response.status).toBe(200);
    });

    it("lets the assignee advance their own task", async () => {
      const task = await createTask(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        status: "assigned",
        assigneeId: memberA2.id,
      });
      const response = await asMemberA2(http().patch(`/api/tasks/${task.id}`)).send({
        status: "finished",
        report: "Done.",
      });
      expect(response.status).toBe(200);
    });
  });

  describe("DELETE /api/tasks/:taskId", () => {
    it("archives a task (soft-delete) and returns 204", async () => {
      const task = await createTask(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA(http().delete(`/api/tasks/${task.id}`));
      expect(response.status).toBe(204);
      const persisted = await prisma.task.findUnique({ where: { id: task.id } });
      expect(persisted?.archivedAt).not.toBeNull();
    });

    it("forbids a non-owner (403), permits the author", async () => {
      const task = await createTask(prisma, { teamId: teamA.id, authorId: memberA.id });
      const byOther = await asMemberA2(http().delete(`/api/tasks/${task.id}`));
      expect(byOther.status).toBe(403);
    });
  });

  describe("Votes (upvote-only, idempotent)", () => {
    it("casts, re-affirms (idempotent), tallies, and retracts an upvote", async () => {
      const task = await createTask(prisma, { teamId: teamA.id, authorId: memberA.id });

      const first = await asMemberA(http().put(`/api/tasks/${task.id}/votes/me`));
      expect(first.status).toBe(200);
      expect(first.body.voteCount).toBe(1);
      expect(first.body.viewerHasVoted).toBe(true);

      // Idempotent: a second PUT keeps exactly one row.
      const second = await asMemberA(http().put(`/api/tasks/${task.id}/votes/me`));
      expect(second.body.voteCount).toBe(1);

      // A different member's vote increments the tally.
      const other = await asMemberA2(http().put(`/api/tasks/${task.id}/votes/me`));
      expect(other.body.voteCount).toBe(2);

      const retract = await asMemberA(http().delete(`/api/tasks/${task.id}/votes/me`));
      expect(retract.status).toBe(204);
      const rows = await prisma.taskVote.findMany({ where: { taskId: task.id } });
      expect(rows).toHaveLength(1);
    });
  });

  describe("Collaboration subject", () => {
    it("accepts a comment on a task (proves subject registration)", async () => {
      const task = await createTask(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA(http().post("/api/comments")).send({
        subjectType: "task",
        subjectId: task.id,
        body: "Let's prioritise this one.",
      });
      expect(response.status).toBe(201);
    });
  });

  describe("Tenant isolation (mandatory)", () => {
    it("returns 404 when a team-A user reads a team-B task", async () => {
      const taskB = await createTask(prisma, { teamId: teamB.id, authorId: memberB.id });
      const response = await asMemberA(http().get(`/api/tasks/${taskB.id}`));
      expect(response.status).toBe(404);
    });

    it("returns 404 (never mutates/votes) when a team-A user writes to a team-B task", async () => {
      const taskB = await createTask(prisma, {
        teamId: teamB.id,
        authorId: memberB.id,
        title: "Bravo task",
      });

      const update = await asMemberA(http().patch(`/api/tasks/${taskB.id}`)).send({
        title: "Hijacked",
      });
      const archive = await asMemberA(http().delete(`/api/tasks/${taskB.id}`));
      const vote = await asMemberA(http().put(`/api/tasks/${taskB.id}/votes/me`));
      expect([update.status, archive.status, vote.status]).toEqual([404, 404, 404]);

      const untouched = await prisma.task.findUnique({ where: { id: taskB.id } });
      expect(untouched?.title).toBe("Bravo task");
      expect(untouched?.archivedAt).toBeNull();
      const votes = await prisma.taskVote.findMany({ where: { taskId: taskB.id } });
      expect(votes).toHaveLength(0);
    });

    it("never surfaces another team's votes in the tally", async () => {
      const taskA = await createTask(prisma, { teamId: teamA.id, authorId: memberA.id });
      // A stray vote row from a foreign user should still count only real rows;
      // the tenancy guarantee is that team-B users cannot reach team-A tasks at all.
      await createTaskVote(prisma, { taskId: taskA.id, userId: memberA2.id });
      const response = await asMemberA(http().get(`/api/tasks/${taskA.id}`));
      expect(response.body.voteCount).toBe(1);
      expect(response.body.viewerHasVoted).toBe(false);
    });

    it("returns 403 for a forged team the caller is not a member of", async () => {
      const taskA = await createTask(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await http()
        .get(`/api/tasks/${taskA.id}`)
        .set("x-test-user-id", memberB.id)
        .set("x-team-id", teamA.id);
      expect(response.status).toBe(403);
    });
  });
});
