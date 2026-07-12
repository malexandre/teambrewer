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
 * Endpoint tests for card-test suggestions. The critical properties are tenant
 * isolation (a team never reaches another team's suggestions/votes, and a suggestion
 * cannot reference another team's deck or another game's card), the guarded status
 * lifecycle with its resolution-note rule, author/admin ownership on edits, and
 * upvote idempotency (one row per member). A two-team Flesh and Blood world plus a
 * Riftbound game backs the suite.
 */
describe("Card-test-suggestion endpoints (integration)", () => {
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
  let archivedDeckA: TestDeck;
  let deckB: TestDeck;
  let cardIn: TestCard;
  let cardOut: TestCard;
  let riftCard: TestCard;

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
    archivedDeckA = await createDeck(prisma, {
      teamId: teamA.id,
      ownerId: memberA.id,
      formatId: fabFormatId,
      name: "Retired Deck",
      archivedAt: new Date(),
    });
    deckB = await createDeck(prisma, {
      teamId: teamB.id,
      ownerId: memberB.id,
      formatId: fabFormatId,
      name: "Team B Deck",
    });
    cardIn = await createCard(prisma, { gameId: "flesh-and-blood", name: "Command and Conquer" });
    cardOut = await createCard(prisma, { gameId: "flesh-and-blood", name: "Sink Below" });
    riftCard = await createCard(prisma, { gameId: "riftbound", name: "Rift Bolt" });
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

  const validSuggestion = () => ({
    deckId: deckA.id,
    cardInId: cardIn.id,
    reasoning: "Improves the go-wide matchup.",
  });

  const createSuggestion = async (
    actor: (req: request.Test) => request.Test = asMemberA,
    body: Record<string, unknown> = validSuggestion(),
  ) => {
    const response = await actor(http().post("/api/card-test-suggestions")).send(body);
    return response;
  };

  describe("create", () => {
    it("creates a suggestion (201) with a resolved card and defaults", async () => {
      const response = await createSuggestion();
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        deckId: deckA.id,
        status: "proposed",
        resolutionNote: "",
        voteCount: 0,
        viewerHasVoted: false,
      });
      expect(response.body.cardIn).toMatchObject({ id: cardIn.id, name: "Command and Conquer" });
      expect(response.body.cardOut).toBeNull();
      expect(response.body.author.userId).toBe(memberA.id);
    });

    it("accepts a swap and rejects a swap where the cards match (400)", async () => {
      const swap = await createSuggestion(asMemberA, {
        ...validSuggestion(),
        cardOutId: cardOut.id,
      });
      expect(swap.status).toBe(201);
      expect(swap.body.cardOut).toMatchObject({ id: cardOut.id });

      const same = await createSuggestion(asMemberA, {
        ...validSuggestion(),
        cardOutId: cardIn.id,
      });
      expect(same.status).toBe(400);
    });

    it("rejects a deck from another team (422)", async () => {
      const response = await createSuggestion(asMemberA, {
        ...validSuggestion(),
        deckId: deckB.id,
      });
      expect(response.status).toBe(422);
    });

    it("rejects creating on an archived deck (422)", async () => {
      const response = await createSuggestion(asMemberA, {
        ...validSuggestion(),
        deckId: archivedDeckA.id,
      });
      expect(response.status).toBe(422);
    });

    it("rejects a card from another game (422)", async () => {
      const response = await createSuggestion(asMemberA, {
        ...validSuggestion(),
        cardInId: riftCard.id,
      });
      expect(response.status).toBe(422);
    });

    it("rejects an unauthenticated request (401)", async () => {
      const response = await http().post("/api/card-test-suggestions").send(validSuggestion());
      expect(response.status).toBe(401);
    });
  });

  describe("list", () => {
    it("returns the team's suggestions filtered by deck and status", async () => {
      await createSuggestion();
      const other = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
        name: "Second Deck",
      });
      await createSuggestion(asMemberA, {
        deckId: other.id,
        cardInId: cardIn.id,
        reasoning: "Other deck idea.",
      });

      const byDeck = await asMemberA(http().get(`/api/card-test-suggestions?deckId=${deckA.id}`));
      expect(byDeck.status).toBe(200);
      expect(byDeck.body.data).toHaveLength(1);
      expect(byDeck.body.data[0].deckId).toBe(deckA.id);

      const byStatus = await asMemberA(http().get("/api/card-test-suggestions?status=testing"));
      expect(byStatus.body.data).toHaveLength(0);
    });
  });

  describe("update / status transitions", () => {
    it("moves proposed -> testing -> adopted with a resolution note", async () => {
      const created = await createSuggestion();
      const id = created.body.id;

      const toTesting = await asMemberA(http().patch(`/api/card-test-suggestions/${id}`)).send({
        status: "testing",
      });
      expect(toTesting.status).toBe(200);
      expect(toTesting.body.status).toBe("testing");

      const toAdopted = await asMemberA(http().patch(`/api/card-test-suggestions/${id}`)).send({
        status: "adopted",
        resolutionNote: "Won the close games; keeping it.",
      });
      expect(toAdopted.status).toBe(200);
      expect(toAdopted.body.status).toBe("adopted");
      expect(toAdopted.body.resolutionNote).toBe("Won the close games; keeping it.");
    });

    it("rejects an illegal transition (422)", async () => {
      const created = await createSuggestion();
      const response = await asMemberA(
        http().patch(`/api/card-test-suggestions/${created.body.id}`),
      ).send({ status: "adopted" });
      expect(response.status).toBe(422);
    });

    it("rejects resolving without a resolution note (422)", async () => {
      const created = await createSuggestion();
      await asMemberA(http().patch(`/api/card-test-suggestions/${created.body.id}`)).send({
        status: "testing",
      });
      const response = await asMemberA(
        http().patch(`/api/card-test-suggestions/${created.body.id}`),
      ).send({ status: "rejected" });
      expect(response.status).toBe(422);
    });

    it("lets a team-admin moderate another member's suggestion but forbids a non-author member (403)", async () => {
      const created = await createSuggestion();
      const id = created.body.id;

      const byOtherMember = await asMemberA2(http().patch(`/api/card-test-suggestions/${id}`)).send(
        { reasoning: "hijack" },
      );
      expect(byOtherMember.status).toBe(403);

      const byAdmin = await asAdminA(http().patch(`/api/card-test-suggestions/${id}`)).send({
        reasoning: "tidy up",
      });
      expect(byAdmin.status).toBe(200);
    });
  });

  describe("voting (upvote-only, idempotent)", () => {
    it("keeps one row per member across repeated votes and reflects distinct upvoters", async () => {
      const created = await createSuggestion();
      const id = created.body.id;

      const first = await asMemberA(http().put(`/api/card-test-suggestions/${id}/votes/me`));
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ voteCount: 1, viewerHasVoted: true });

      // A repeated vote by the same member is idempotent.
      const again = await asMemberA(http().put(`/api/card-test-suggestions/${id}/votes/me`));
      expect(again.body.voteCount).toBe(1);

      // A second distinct member increments the tally.
      const byOther = await asMemberA2(http().put(`/api/card-test-suggestions/${id}/votes/me`));
      expect(byOther.body.voteCount).toBe(2);

      // The row count in the DB confirms one vote per member.
      const rows = await prisma.suggestionVote.count({ where: { suggestionId: id } });
      expect(rows).toBe(2);
    });

    it("retracts a vote and returns 204", async () => {
      const created = await createSuggestion();
      const id = created.body.id;
      await asMemberA(http().put(`/api/card-test-suggestions/${id}/votes/me`));

      const retract = await asMemberA(http().delete(`/api/card-test-suggestions/${id}/votes/me`));
      expect(retract.status).toBe(204);

      const list = await asMemberA(http().get(`/api/card-test-suggestions?deckId=${deckA.id}`));
      expect(list.body.data[0]).toMatchObject({ voteCount: 0, viewerHasVoted: false });
    });
  });

  describe("archive", () => {
    it("archives a suggestion (204) and drops it from the list", async () => {
      const created = await createSuggestion();
      const del = await asMemberA(http().delete(`/api/card-test-suggestions/${created.body.id}`));
      expect(del.status).toBe(204);

      const list = await asMemberA(http().get("/api/card-test-suggestions"));
      expect(list.body.data).toHaveLength(0);
    });
  });

  describe("tenant isolation (mandatory)", () => {
    it("does not let team B read team A's suggestions", async () => {
      await createSuggestion();
      const list = await asMemberB(http().get("/api/card-test-suggestions"));
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(0);
    });

    it("returns 404 when team B edits or votes on team A's suggestion (no enumeration)", async () => {
      const created = await createSuggestion();
      const id = created.body.id;

      const edit = await asMemberB(http().patch(`/api/card-test-suggestions/${id}`)).send({
        reasoning: "cross-tenant",
      });
      expect(edit.status).toBe(404);

      const vote = await asMemberB(http().put(`/api/card-test-suggestions/${id}/votes/me`));
      expect(vote.status).toBe(404);
    });

    it("returns 403 for a forged team id the caller is not a member of", async () => {
      const created = await createSuggestion();
      const response = await http()
        .patch(`/api/card-test-suggestions/${created.body.id}`)
        .set("x-test-user-id", memberB.id)
        .set("x-team-id", teamA.id)
        .send({ reasoning: "forged" });
      expect(response.status).toBe(403);
    });
  });
});
