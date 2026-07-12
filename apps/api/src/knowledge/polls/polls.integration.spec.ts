import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../../test/database.js";
import {
  addMembership,
  createPoll,
  createPollVote,
  createTeam,
  createTestPrismaClient,
  createUser,
  type TestTeam,
  type TestUser,
} from "../../../test/factories.js";
import { createApiTestApp } from "../../../test/nest-app.js";
import { AppModule } from "../../app.module.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

/**
 * Endpoint tests for polls. The critical properties are tenant isolation (a team never
 * reaches another team's polls or votes), the one-vote-per-member upsert, rejecting votes
 * on a closed/expired poll, the open↔closed lifecycle (incl. `closesAt` expiry), and tally
 * correctness against a crafted vote set.
 */
describe("Polls endpoints (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let teamA: TestTeam;
  let teamB: TestTeam;
  let adminA: TestUser;
  let memberA: TestUser;
  let memberA2: TestUser;
  let memberA3: TestUser;
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

    teamA = await createTeam(prisma, { name: "Alpha", gameId: "flesh-and-blood" });
    teamB = await createTeam(prisma, { name: "Bravo", gameId: "flesh-and-blood" });
    adminA = await createUser(prisma, { username: "admin_a" });
    memberA = await createUser(prisma, { username: "member_a" });
    memberA2 = await createUser(prisma, { username: "member_a2" });
    memberA3 = await createUser(prisma, { username: "member_a3" });
    memberB = await createUser(prisma, { username: "member_b" });
    await addMembership(prisma, { teamId: teamA.id, userId: adminA.id, role: "team_admin" });
    await addMembership(prisma, { teamId: teamA.id, userId: memberA.id, role: "member" });
    await addMembership(prisma, { teamId: teamA.id, userId: memberA2.id, role: "member" });
    await addMembership(prisma, { teamId: teamA.id, userId: memberA3.id, role: "member" });
    await addMembership(prisma, { teamId: teamB.id, userId: memberB.id, role: "member" });
  });

  const http = () => request(app.getHttpServer());
  const asMemberA = (req: request.Test) =>
    req.set("x-test-user-id", memberA.id).set("x-team-id", teamA.id);
  const asMemberA2 = (req: request.Test) =>
    req.set("x-test-user-id", memberA2.id).set("x-team-id", teamA.id);
  const asMemberA3 = (req: request.Test) =>
    req.set("x-test-user-id", memberA3.id).set("x-team-id", teamA.id);
  const asAdminA = (req: request.Test) =>
    req.set("x-test-user-id", adminA.id).set("x-team-id", teamA.id);

  /** Read a seeded poll's option by index, asserting it exists (keeps tests strict-typed). */
  const optionAt = (poll: { options: { id: string; label: string }[] }, index: number) => {
    const option = poll.options[index];
    if (!option) {
      throw new Error(`poll option ${index} missing from seed`);
    }
    return option;
  };

  describe("POST /api/polls", () => {
    it("creates an open poll with option ids assigned", async () => {
      const response = await asMemberA(http().post("/api/polls")).send({
        question: "Which deck for Nationals?",
        options: ["Fai", "Kano"],
      });
      expect(response.status).toBe(201);
      expect(response.body.status).toBe("open");
      expect(response.body.options).toHaveLength(2);
      expect(response.body.options[0]).toHaveProperty("id");
      expect(response.body.options[0].label).toBe("Fai");
      expect(response.body.totalVotes).toBe(0);
      expect(response.body.myVoteOptionId).toBeNull();
    });

    it("rejects fewer than two options (400)", async () => {
      const response = await asMemberA(http().post("/api/polls")).send({
        question: "One choice?",
        options: ["Only"],
      });
      expect(response.status).toBe(400);
    });

    it("rejects a closesAt already in the past (422)", async () => {
      const response = await asMemberA(http().post("/api/polls")).send({
        question: "Late?",
        options: ["A", "B"],
        closesAt: "2000-01-01T00:00:00.000Z",
      });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("DOMAIN_RULE_VIOLATION");
    });

    it("rejects an unauthenticated request (401)", async () => {
      const response = await http()
        .post("/api/polls")
        .send({ question: "Q", options: ["A", "B"] });
      expect(response.status).toBe(401);
    });
  });

  describe("voting", () => {
    it("records one vote per member and updates on re-vote (never duplicates)", async () => {
      const poll = await createPoll(prisma, { teamId: teamA.id, authorId: memberA.id });
      const fai = optionAt(poll, 0);
      const kano = optionAt(poll, 1);

      const first = await asMemberA(http().put(`/api/polls/${poll.id}/vote`)).send({
        optionId: fai.id,
      });
      expect(first.status).toBe(200);
      expect(first.body.myVoteOptionId).toBe(fai.id);
      expect(first.body.totalVotes).toBe(1);

      // Same member re-votes: the vote moves, it does not accumulate.
      const second = await asMemberA(http().put(`/api/polls/${poll.id}/vote`)).send({
        optionId: kano.id,
      });
      expect(second.body.myVoteOptionId).toBe(kano.id);
      expect(second.body.totalVotes).toBe(1);

      const stored = await prisma.pollVote.count({ where: { pollId: poll.id } });
      expect(stored).toBe(1);
    });

    it("computes the tally (counts + percentages) for a crafted vote set", async () => {
      const poll = await createPoll(prisma, { teamId: teamA.id, authorId: memberA.id });
      const fai = optionAt(poll, 0);
      const kano = optionAt(poll, 1);
      // Two votes for Fai, one for Kano → 67% / 33%.
      await asMemberA(http().put(`/api/polls/${poll.id}/vote`)).send({ optionId: fai.id });
      await asMemberA2(http().put(`/api/polls/${poll.id}/vote`)).send({ optionId: fai.id });
      const final = await asMemberA3(http().put(`/api/polls/${poll.id}/vote`)).send({
        optionId: kano.id,
      });

      expect(final.body.totalVotes).toBe(3);
      const faiResult = final.body.results.find(
        (result: { optionId: string }) => result.optionId === fai.id,
      );
      const kanoResult = final.body.results.find(
        (result: { optionId: string }) => result.optionId === kano.id,
      );
      expect(faiResult.count).toBe(2);
      expect(faiResult.percentage).toBe(67);
      expect(kanoResult.count).toBe(1);
      expect(kanoResult.percentage).toBe(33);
    });

    it("rejects an optionId that is not part of the poll (422)", async () => {
      const poll = await createPoll(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA(http().put(`/api/polls/${poll.id}/vote`)).send({
        optionId: "not-a-real-option",
      });
      expect(response.status).toBe(422);
    });

    it("retracts a vote", async () => {
      const poll = await createPoll(prisma, { teamId: teamA.id, authorId: memberA.id });
      const fai = optionAt(poll, 0);
      await asMemberA(http().put(`/api/polls/${poll.id}/vote`)).send({ optionId: fai.id });
      const response = await asMemberA(http().delete(`/api/polls/${poll.id}/vote`));
      expect(response.status).toBe(200);
      expect(response.body.myVoteOptionId).toBeNull();
      expect(response.body.totalVotes).toBe(0);
    });

    it("rejects a vote on a manually-closed poll (422)", async () => {
      const poll = await createPoll(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        status: "closed",
      });
      const response = await asMemberA(http().put(`/api/polls/${poll.id}/vote`)).send({
        optionId: optionAt(poll, 0).id,
      });
      expect(response.status).toBe(422);
    });

    it("rejects a vote on a poll whose closesAt has passed (422)", async () => {
      const poll = await createPoll(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        status: "open",
        closesAt: new Date("2000-01-01T00:00:00.000Z"),
      });
      const response = await asMemberA(http().put(`/api/polls/${poll.id}/vote`)).send({
        optionId: optionAt(poll, 0).id,
      });
      expect(response.status).toBe(422);
    });
  });

  describe("lifecycle (PATCH)", () => {
    it("closes a poll (author) and reports the effective status", async () => {
      const poll = await createPoll(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA(http().patch(`/api/polls/${poll.id}`)).send({
        status: "closed",
      });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("closed");
    });

    it("closing is idempotent-safe and reopening works while not expired", async () => {
      const poll = await createPoll(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        status: "closed",
      });
      const reopened = await asAdminA(http().patch(`/api/polls/${poll.id}`)).send({
        status: "open",
      });
      expect(reopened.status).toBe(200);
      expect(reopened.body.status).toBe("open");
    });

    it("rejects reopening a poll whose closesAt has passed (422)", async () => {
      const poll = await createPoll(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        status: "closed",
        closesAt: new Date("2000-01-01T00:00:00.000Z"),
      });
      const response = await asMemberA(http().patch(`/api/polls/${poll.id}`)).send({
        status: "open",
      });
      expect(response.status).toBe(422);
    });

    it("forbids a non-author, non-admin member from editing (403)", async () => {
      const poll = await createPoll(prisma, { teamId: teamA.id, authorId: memberA.id });
      const response = await asMemberA2(http().patch(`/api/polls/${poll.id}`)).send({
        question: "Hijacked?",
      });
      expect(response.status).toBe(403);
    });

    it("rejects changing options once votes exist (422)", async () => {
      const poll = await createPoll(prisma, { teamId: teamA.id, authorId: memberA.id });
      await createPollVote(prisma, {
        pollId: poll.id,
        userId: memberA2.id,
        optionId: optionAt(poll, 0).id,
      });
      const response = await asMemberA(http().patch(`/api/polls/${poll.id}`)).send({
        options: ["New A", "New B"],
      });
      expect(response.status).toBe(422);
    });
  });

  describe("GET /api/polls", () => {
    it("filters by effective status (expired open poll counts as closed)", async () => {
      await createPoll(prisma, { teamId: teamA.id, authorId: memberA.id, status: "open" });
      await createPoll(prisma, {
        teamId: teamA.id,
        authorId: memberA.id,
        status: "open",
        closesAt: new Date("2000-01-01T00:00:00.000Z"),
      });
      const open = await asMemberA(http().get("/api/polls").query({ status: "open" }));
      expect(open.body.data).toHaveLength(1);
      const closed = await asMemberA(http().get("/api/polls").query({ status: "closed" }));
      expect(closed.body.data).toHaveLength(1);
      expect(closed.body.data[0].status).toBe("closed");
    });
  });

  describe("tenant isolation", () => {
    it("does not return another team's polls", async () => {
      await createPoll(prisma, { teamId: teamB.id, authorId: memberB.id });
      const response = await asMemberA(http().get("/api/polls"));
      expect(response.body.data).toHaveLength(0);
    });

    it("returns 404 reading another team's poll", async () => {
      const foreign = await createPoll(prisma, { teamId: teamB.id, authorId: memberB.id });
      const response = await asMemberA(http().get(`/api/polls/${foreign.id}`));
      expect(response.status).toBe(404);
    });

    it("cannot vote on another team's poll (404)", async () => {
      const foreign = await createPoll(prisma, { teamId: teamB.id, authorId: memberB.id });
      const response = await asMemberA(http().put(`/api/polls/${foreign.id}/vote`)).send({
        optionId: optionAt(foreign, 0).id,
      });
      expect(response.status).toBe(404);
      const votes = await prisma.pollVote.count({ where: { pollId: foreign.id } });
      expect(votes).toBe(0);
    });

    it("returns 403 when a member forges another team's X-Team-Id", async () => {
      const response = await http()
        .get("/api/polls")
        .set("x-test-user-id", memberA.id)
        .set("x-team-id", teamB.id);
      expect(response.status).toBe(403);
    });
  });
});
