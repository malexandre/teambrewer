import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import {
  addMembership,
  createDeck,
  createFormat,
  createGame,
  createTeam,
  createTestPrismaClient,
  createUser,
  type TestDeck,
  type TestTeam,
  type TestUser,
} from "../../test/factories.js";
import { createApiTestApp } from "../../test/nest-app.js";
import { AppModule } from "../app.module.js";
import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Endpoint tests for the collaboration subsystem, exercised through its first
 * adopter (decks). The critical properties are tenant isolation (a team never
 * reaches another team's comments, notifications, or activity) and the mention →
 * notification, threading, and moderation rules on top of it.
 */
describe("Collaboration endpoints (integration)", () => {
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

    await createGame(prisma, { id: "flesh-and-blood", key: "flesh_and_blood", name: "FaB" });
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

    fabFormatId = (await createFormat(prisma, { gameId: "flesh-and-blood", key: "cc" })).id;
    deckA = await createDeck(prisma, {
      teamId: teamA.id,
      ownerId: memberA.id,
      formatId: fabFormatId,
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

  const postComment = (as: (r: request.Test) => request.Test, body: Record<string, unknown>) =>
    as(http().post("/api/comments")).send(body);

  describe("POST /api/comments", () => {
    it("creates a top-level comment on a deck, stamping author from context", async () => {
      const response = await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "This list looks strong.",
      });
      expect(response.status).toBe(201);
      expect(response.body.author.userId).toBe(memberA.id);
      expect(response.body.parentCommentId).toBeNull();
      expect(response.body.replies).toEqual([]);
    });

    it("nests a reply under its parent and flattens a reply-to-a-reply", async () => {
      const parent = await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "Parent",
      });
      const reply = await postComment(asMemberA2, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "Reply",
        parentCommentId: parent.body.id,
      });
      expect(reply.body.parentCommentId).toBe(parent.body.id);

      // A reply to the reply attaches to the same top-level parent.
      const nested = await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "Reply to reply",
        parentCommentId: reply.body.id,
      });
      expect(nested.body.parentCommentId).toBe(parent.body.id);
    });

    it("rejects an unknown subjectType at the boundary (400)", async () => {
      const response = await postComment(asMemberA, {
        subjectType: "mystery",
        subjectId: deckA.id,
        body: "x",
      });
      expect(response.status).toBe(400);
    });

    it("rejects a comment on an archived deck (422)", async () => {
      const archived = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
        archivedAt: new Date(),
      });
      const response = await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: archived.id,
        body: "late comment",
      });
      expect(response.status).toBe(422);
    });
  });

  describe("mentions -> notifications", () => {
    it("notifies a mentioned teammate exactly once", async () => {
      await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "hey @member_a2 take a look",
      });
      const notifications = await asMemberA2(http().get("/api/notifications"));
      expect(notifications.status).toBe(200);
      expect(notifications.body.data).toHaveLength(1);
      expect(notifications.body.unreadCount).toBe(1);
      expect(notifications.body.data[0].type).toBe("mention");
      expect(notifications.body.data[0].subjectId).toBe(deckA.id);
      expect(notifications.body.data[0].actor.userId).toBe(memberA.id);
    });

    it("does not notify on a self-mention", async () => {
      await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "note to self @member_a",
      });
      const notifications = await asMemberA(http().get("/api/notifications"));
      expect(notifications.body.data).toHaveLength(0);
    });

    it("does not notify — or leak to — a user outside the acting team", async () => {
      // memberB belongs only to team B; mentioning @member_b from team A resolves
      // to nobody and creates no notification.
      await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "ping @member_b",
      });
      const bravoInbox = await asMemberB(http().get("/api/notifications"));
      expect(bravoInbox.body.data).toHaveLength(0);
      const mentionCount = await prisma.mention.count();
      expect(mentionCount).toBe(0);
    });

    it("re-resolves mentions on edit without duplicating existing ones", async () => {
      const created = await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "no mentions yet",
      });
      // First edit adds a mention -> one notification.
      await asMemberA(http().patch(`/api/comments/${created.body.id}`)).send({
        body: "now pinging @member_a2",
      });
      // Second edit still mentions the same user -> no duplicate notification.
      await asMemberA(http().patch(`/api/comments/${created.body.id}`)).send({
        body: "still pinging @member_a2 with more detail",
      });
      const notifications = await asMemberA2(http().get("/api/notifications"));
      expect(notifications.body.data).toHaveLength(1);
    });
  });

  describe("GET /api/comments", () => {
    it("returns nested threads and keeps a soft-deleted comment as removed", async () => {
      const parent = await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "top-level",
      });
      await postComment(asMemberA2, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "a reply",
        parentCommentId: parent.body.id,
      });
      await asMemberA(http().delete(`/api/comments/${parent.body.id}`));

      const thread = await asMemberA(
        http().get("/api/comments").query({ subjectType: "deck", subjectId: deckA.id }),
      );
      expect(thread.status).toBe(200);
      expect(thread.body.data).toHaveLength(1);
      expect(thread.body.data[0].archivedAt).not.toBeNull();
      // The removed comment's body is withheld but the thread structure survives.
      expect(thread.body.data[0].body).toBe("");
      expect(thread.body.data[0].replies).toHaveLength(1);
      expect(thread.body.data[0].replies[0].body).toBe("a reply");
    });
  });

  describe("PATCH/DELETE /api/comments/:commentId (moderation)", () => {
    it("lets the author edit their own comment", async () => {
      const created = await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "original",
      });
      const response = await asMemberA(http().patch(`/api/comments/${created.body.id}`)).send({
        body: "edited",
      });
      expect(response.status).toBe(200);
      expect(response.body.body).toBe("edited");
    });

    it("lets a team-admin moderate another member's comment", async () => {
      const created = await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "member's comment",
      });
      const edit = await asAdminA(http().patch(`/api/comments/${created.body.id}`)).send({
        body: "moderated",
      });
      expect(edit.status).toBe(200);
      const remove = await asAdminA(http().delete(`/api/comments/${created.body.id}`));
      expect(remove.status).toBe(204);
    });

    it("forbids a non-author, non-admin member from editing (403)", async () => {
      const created = await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "member A's comment",
      });
      const response = await asMemberA2(http().patch(`/api/comments/${created.body.id}`)).send({
        body: "hijack",
      });
      expect(response.status).toBe(403);
    });
  });

  describe("notification center", () => {
    async function notifyMemberA2(): Promise<void> {
      await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "@member_a2 review please",
      });
    }

    it("marks a single notification read", async () => {
      await notifyMemberA2();
      const before = await asMemberA2(http().get("/api/notifications"));
      const notificationId = before.body.data[0].id;
      const read = await asMemberA2(http().patch(`/api/notifications/${notificationId}/read`));
      expect(read.status).toBe(204);
      const after = await asMemberA2(http().get("/api/notifications"));
      expect(after.body.unreadCount).toBe(0);
    });

    it("marks all notifications read", async () => {
      await notifyMemberA2();
      const readAll = await asMemberA2(http().post("/api/notifications/read-all"));
      expect(readAll.status).toBe(204);
      const after = await asMemberA2(http().get("/api/notifications"));
      expect(after.body.unreadCount).toBe(0);
    });
  });

  describe("activity feed", () => {
    it("emits deck lifecycle and comment activity", async () => {
      // Create a deck through the API so the create emits activity.
      const created = await asMemberA(http().post("/api/decks")).send({
        name: "Activity Deck",
        formatId: fabFormatId,
        externalUrl: "https://fabrary.net/decks/act1",
      });
      const deckId = created.body.id;
      await asMemberA(http().patch(`/api/decks/${deckId}/status`)).send({ status: "testing" });
      await postComment(asMemberA, { subjectType: "deck", subjectId: deckId, body: "commenting" });

      const feed = await asMemberA(http().get("/api/activity"));
      expect(feed.status).toBe(200);
      const verbs = feed.body.data.map((event: { verb: string }) => event.verb);
      expect(verbs).toContain("deck_created");
      expect(verbs).toContain("deck_status_changed");
      expect(verbs).toContain("commented");

      const perSubject = await asMemberA(
        http().get("/api/activity").query({ subjectType: "deck", subjectId: deckId }),
      );
      expect(
        perSubject.body.data.every((event: { subjectId: string }) => event.subjectId === deckId),
      ).toBe(true);
    });
  });

  describe("Tenant isolation (mandatory)", () => {
    it("returns 404 reading comments for another team's deck", async () => {
      const bDeck = await createDeck(prisma, {
        teamId: teamB.id,
        ownerId: memberB.id,
        formatId: fabFormatId,
      });
      const response = await asMemberA(
        http().get("/api/comments").query({ subjectType: "deck", subjectId: bDeck.id }),
      );
      expect(response.status).toBe(404);
    });

    it("returns 404 posting a comment on another team's deck", async () => {
      const bDeck = await createDeck(prisma, {
        teamId: teamB.id,
        ownerId: memberB.id,
        formatId: fabFormatId,
      });
      const response = await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: bDeck.id,
        body: "cross-tenant",
      });
      expect(response.status).toBe(404);
    });

    it("rejects a forged X-Team-Id the caller is not a member of (403)", async () => {
      const response = await http()
        .get("/api/comments")
        .query({ subjectType: "deck", subjectId: deckA.id })
        .set("x-test-user-id", memberA.id)
        .set("x-team-id", teamB.id);
      expect(response.status).toBe(403);
    });

    it("never routes a mention notification to another team's member", async () => {
      await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "@member_b @member_a2 look",
      });
      // memberA2 (in team A) is notified; memberB (team B) is not.
      const bravoInbox = await asMemberB(http().get("/api/notifications"));
      expect(bravoInbox.body.data).toHaveLength(0);
      const alphaInbox = await asMemberA2(http().get("/api/notifications"));
      expect(alphaInbox.body.data).toHaveLength(1);
    });

    it("cannot mark another user's notification read (404)", async () => {
      await postComment(asMemberA, {
        subjectType: "deck",
        subjectId: deckA.id,
        body: "@member_a2 hi",
      });
      const inbox = await asMemberA2(http().get("/api/notifications"));
      const notificationId = inbox.body.data[0].id;
      // memberA (a different user) cannot mark memberA2's notification read.
      const response = await asMemberA(http().patch(`/api/notifications/${notificationId}/read`));
      expect(response.status).toBe(404);
    });

    it("shows a team only its own activity feed", async () => {
      const aDeck = await asMemberA(http().post("/api/decks")).send({
        name: "Alpha Deck",
        formatId: fabFormatId,
        externalUrl: "https://fabrary.net/decks/alpha",
      });
      const feed = await asMemberB(http().get("/api/activity"));
      const subjectIds = feed.body.data.map((event: { subjectId: string }) => event.subjectId);
      expect(subjectIds).not.toContain(aDeck.body.id);
    });
  });
});
