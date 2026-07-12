import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import {
  addMembership,
  createDeck,
  createFormat,
  createGame,
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
 * Endpoint tests for decks. The critical properties are tenant isolation (a team
 * never reaches another team's decks) and the ownership/visibility rules on top
 * of it. A two-team Flesh and Blood world plus a Riftbound game (for cross-game
 * FK rejection) backs the suite.
 */
describe("Decks endpoints (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let teamA: TestTeam;
  let teamB: TestTeam;
  let adminA: TestUser;
  let memberA: TestUser;
  let memberA2: TestUser;
  let memberB: TestUser;

  let fabFormatId: string;
  let fabHeroId: string;
  let riftFormatId: string;
  let riftHeroId: string;

  const fabrikaryUrl = "https://fabrary.net/decks/abc123";

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

    await createGame(prisma, { id: "flesh-and-blood", key: "flesh_and_blood", name: "Flesh and Blood" });
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

    fabFormatId = (await createFormat(prisma, { gameId: "flesh-and-blood", key: "cc", name: "Classic Constructed" })).id;
    fabHeroId = (await createHero(prisma, { gameId: "flesh-and-blood", name: "Dorinthea" })).id;
    riftFormatId = (await createFormat(prisma, { gameId: "riftbound", key: "standard", name: "Standard" })).id;
    riftHeroId = (await createHero(prisma, { gameId: "riftbound", name: "Rift Legend" })).id;
  });

  const http = () => request(app.getHttpServer());
  const asMemberA = (req: request.Test) => req.set("x-test-user-id", memberA.id).set("x-team-id", teamA.id);
  const asMemberA2 = (req: request.Test) => req.set("x-test-user-id", memberA2.id).set("x-team-id", teamA.id);
  const asAdminA = (req: request.Test) => req.set("x-test-user-id", adminA.id).set("x-team-id", teamA.id);
  const asMemberB = (req: request.Test) => req.set("x-test-user-id", memberB.id).set("x-team-id", teamB.id);

  const validBody = () => ({ name: "Aggro Dori", formatId: fabFormatId, externalUrl: fabrikaryUrl });

  describe("POST /api/decks", () => {
    it("creates a deck, stamping teamId/gameId/ownerId server-side and recognizing the link", async () => {
      const response = await asMemberA(http().post("/api/decks")).send({
        ...validBody(),
        heroId: fabHeroId,
        // A spoofed teamId/ownerId in the body must be ignored.
        teamId: teamB.id,
        ownerId: memberB.id,
      });
      expect(response.status).toBe(201);
      expect(response.body.status).toBe("exploratory");
      expect(response.body.source).toBe("fabrary");
      expect(response.body.ownerId).toBe(memberA.id);
      expect(response.body.gameId).toBe("flesh-and-blood");

      const persisted = await prisma.deck.findUnique({ where: { id: response.body.id } });
      expect(persisted?.teamId).toBe(teamA.id);
      expect(persisted?.ownerId).toBe(memberA.id);
    });

    it("labels an unrecognized link with a generic source", async () => {
      const response = await asMemberA(http().post("/api/decks")).send({
        ...validBody(),
        externalUrl: "https://example.com/my-list",
      });
      expect(response.status).toBe(201);
      expect(response.body.source).toBe("other");
    });

    it("rejects an invalid externalUrl (400)", async () => {
      const response = await asMemberA(http().post("/api/decks")).send({ ...validBody(), externalUrl: "not a url" });
      expect(response.status).toBe(400);
    });

    it("rejects a format from another game (cross-game FK → 404)", async () => {
      const response = await asMemberA(http().post("/api/decks")).send({ ...validBody(), formatId: riftFormatId });
      expect(response.status).toBe(404);
    });

    it("rejects a hero from another game (cross-game FK → 404)", async () => {
      const response = await asMemberA(http().post("/api/decks")).send({ ...validBody(), heroId: riftHeroId });
      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/decks", () => {
    it("lists only the active team's non-archived decks", async () => {
      await createDeck(prisma, { teamId: teamA.id, ownerId: memberA.id, formatId: fabFormatId, name: "A-live" });
      await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
        name: "A-archived",
        archivedAt: new Date(),
      });
      await createDeck(prisma, { teamId: teamB.id, ownerId: memberB.id, formatId: fabFormatId, name: "B-secret" });

      const response = await asMemberA(http().get("/api/decks"));
      expect(response.status).toBe(200);
      const names = response.body.data.map((deck: { name: string }) => deck.name);
      expect(names).toContain("A-live");
      expect(names).not.toContain("A-archived");
      expect(names).not.toContain("B-secret");
    });

    it("filters by status and paginates with a keyset cursor", async () => {
      for (let index = 0; index < 3; index += 1) {
        await createDeck(prisma, {
          teamId: teamA.id,
          ownerId: memberA.id,
          formatId: fabFormatId,
          name: `Deck ${index}`,
          status: "testing",
        });
      }
      await createDeck(prisma, { teamId: teamA.id, ownerId: memberA.id, formatId: fabFormatId, status: "retired" });

      const testing = await asMemberA(http().get("/api/decks").query({ status: "testing" }));
      expect(testing.body.data).toHaveLength(3);

      const first = await asMemberA(http().get("/api/decks").query({ status: "testing", limit: 2 }));
      expect(first.body.data).toHaveLength(2);
      expect(first.body.nextCursor).not.toBeNull();
      const second = await asMemberA(
        http().get("/api/decks").query({ status: "testing", limit: 2, cursor: first.body.nextCursor }),
      );
      const firstIds = first.body.data.map((deck: { id: string }) => deck.id);
      const secondIds = second.body.data.map((deck: { id: string }) => deck.id);
      expect(firstIds.filter((id: string) => secondIds.includes(id))).toEqual([]);
    });

    it("filters by isReference precisely", async () => {
      await createDeck(prisma, { teamId: teamA.id, ownerId: memberA.id, formatId: fabFormatId, isReference: true, name: "Ref" });
      await createDeck(prisma, { teamId: teamA.id, ownerId: memberA.id, formatId: fabFormatId, isReference: false, name: "Ours" });

      const refs = await asMemberA(http().get("/api/decks").query({ isReference: "true" }));
      expect(refs.body.data.map((deck: { name: string }) => deck.name)).toEqual(["Ref"]);
      const ours = await asMemberA(http().get("/api/decks").query({ isReference: "false" }));
      expect(ours.body.data.map((deck: { name: string }) => deck.name)).toEqual(["Ours"]);
    });
  });

  describe("Tenant isolation (mandatory)", () => {
    it("returns 404 for another team's deck by id", async () => {
      const bDeck = await createDeck(prisma, { teamId: teamB.id, ownerId: memberB.id, formatId: fabFormatId });
      const response = await asMemberA(http().get(`/api/decks/${bDeck.id}`));
      expect(response.status).toBe(404);
    });

    it("rejects a forged X-Team-Id the caller is not a member of (403)", async () => {
      const response = await http()
        .get("/api/decks")
        .set("x-test-user-id", memberA.id)
        .set("x-team-id", teamB.id);
      expect(response.status).toBe(403);
    });

    it("cannot update, archive, change status, or annotate another team's deck (404)", async () => {
      const bDeck = await createDeck(prisma, { teamId: teamB.id, ownerId: memberB.id, formatId: fabFormatId });
      const update = await asMemberA(http().patch(`/api/decks/${bDeck.id}`)).send({ name: "hijacked" });
      const archive = await asMemberA(http().delete(`/api/decks/${bDeck.id}`));
      const status = await asMemberA(http().patch(`/api/decks/${bDeck.id}/status`)).send({ status: "testing" });
      const iterate = await asMemberA(http().post(`/api/decks/${bDeck.id}/iteration-entries`)).send({ body: "x" });
      expect([update.status, archive.status, status.status, iterate.status]).toEqual([404, 404, 404, 404]);

      const untouched = await prisma.deck.findUnique({ where: { id: bDeck.id } });
      expect(untouched?.name).toBe(bDeck.name);
      expect(untouched?.archivedAt).toBeNull();
    });
  });

  describe("Ownership & moderation", () => {
    it("lets a member edit their own deck", async () => {
      const deck = await createDeck(prisma, { teamId: teamA.id, ownerId: memberA.id, formatId: fabFormatId });
      const response = await asMemberA(http().patch(`/api/decks/${deck.id}`)).send({ name: "Renamed" });
      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Renamed");
    });

    it("forbids a member editing another member's team deck (403)", async () => {
      const deck = await createDeck(prisma, { teamId: teamA.id, ownerId: adminA.id, formatId: fabFormatId, visibility: "team" });
      const response = await asMemberA(http().patch(`/api/decks/${deck.id}`)).send({ name: "nope" });
      expect(response.status).toBe(403);
    });

    it("lets a team-admin moderate any in-team deck", async () => {
      const deck = await createDeck(prisma, { teamId: teamA.id, ownerId: memberA.id, formatId: fabFormatId });
      const edit = await asAdminA(http().patch(`/api/decks/${deck.id}`)).send({ name: "Moderated" });
      expect(edit.status).toBe(200);
      const archive = await asAdminA(http().delete(`/api/decks/${deck.id}`));
      expect(archive.status).toBe(204);
    });
  });

  describe("Visibility", () => {
    it("hides a private draft from another member but shows it to the owner and team-admins", async () => {
      const draft = await createDeck(prisma, {
        teamId: teamA.id,
        ownerId: memberA.id,
        formatId: fabFormatId,
        visibility: "private",
        name: "Secret Tech",
      });

      const asOther = await asMemberA2(http().get(`/api/decks/${draft.id}`));
      expect(asOther.status).toBe(404);
      const otherList = await asMemberA2(http().get("/api/decks"));
      expect(otherList.body.data.map((deck: { name: string }) => deck.name)).not.toContain("Secret Tech");

      const asOwner = await asMemberA(http().get(`/api/decks/${draft.id}`));
      expect(asOwner.status).toBe(200);
      const asAdmin = await asAdminA(http().get(`/api/decks/${draft.id}`));
      expect(asAdmin.status).toBe(200);
    });
  });

  describe("Status lifecycle", () => {
    it("applies an allowed transition", async () => {
      const deck = await createDeck(prisma, { teamId: teamA.id, ownerId: memberA.id, formatId: fabFormatId, status: "exploratory" });
      const response = await asMemberA(http().patch(`/api/decks/${deck.id}/status`)).send({ status: "testing" });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("testing");
    });

    it("rejects a disallowed transition (422)", async () => {
      const deck = await createDeck(prisma, { teamId: teamA.id, ownerId: memberA.id, formatId: fabFormatId, status: "retired" });
      const response = await asMemberA(http().patch(`/api/decks/${deck.id}/status`)).send({ status: "exploratory" });
      expect(response.status).toBe(422);
    });

    it("rejects a status field on the general update route (400)", async () => {
      const deck = await createDeck(prisma, { teamId: teamA.id, ownerId: memberA.id, formatId: fabFormatId });
      const response = await asMemberA(http().patch(`/api/decks/${deck.id}`)).send({ status: "retired" });
      expect(response.status).toBe(400);
    });
  });

  describe("Iteration log", () => {
    it("appends author-attributed entries, listed most-recent first", async () => {
      const deck = await createDeck(prisma, { teamId: teamA.id, ownerId: memberA.id, formatId: fabFormatId });
      await asMemberA(http().post(`/api/decks/${deck.id}/iteration-entries`)).send({ body: "first change" });
      const second = await asMemberA(http().post(`/api/decks/${deck.id}/iteration-entries`)).send({ body: "second change" });
      expect(second.status).toBe(201);
      expect(second.body.authorId).toBe(memberA.id);

      const list = await asMemberA(http().get(`/api/decks/${deck.id}/iteration-entries`));
      expect(list.body.data.map((entry: { body: string }) => entry.body)).toEqual(["second change", "first change"]);
    });

    it("forbids a non-owner member from adding an entry (403)", async () => {
      const deck = await createDeck(prisma, { teamId: teamA.id, ownerId: memberA.id, formatId: fabFormatId, visibility: "team" });
      const response = await asMemberA2(http().post(`/api/decks/${deck.id}/iteration-entries`)).send({ body: "sneaky" });
      expect(response.status).toBe(403);
    });
  });

  describe("POST /api/decks/recognize-url", () => {
    it("recognizes a Fabrary URL (metadata only, no fetch)", async () => {
      const response = await asMemberA(http().post("/api/decks/recognize-url")).send({ url: fabrikaryUrl });
      expect(response.status).toBe(200);
      expect(response.body.recognized).toEqual({ provider: "fabrary", externalId: "abc123" });
    });

    it("returns null for an unrecognized URL", async () => {
      const response = await asMemberA(http().post("/api/decks/recognize-url")).send({ url: "https://example.com/x" });
      expect(response.status).toBe(200);
      expect(response.body.recognized).toBeNull();
    });
  });
});
