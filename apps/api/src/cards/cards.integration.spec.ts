import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import {
  addMembership,
  createCard,
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
 * Endpoint tests for card search + reference reads. The critical property is
 * game isolation: a team on one game can never retrieve another game's data.
 */
describe("Cards endpoints (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  // A two-game world: a Flesh and Blood team and a Riftbound team.
  let fabTeam: TestTeam;
  let fabUser: TestUser;
  let riftTeam: TestTeam;
  let riftUser: TestUser;

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

    fabTeam = await createTeam(prisma, { gameId: "flesh-and-blood" });
    fabUser = await createUser(prisma);
    await addMembership(prisma, { teamId: fabTeam.id, userId: fabUser.id, role: "member" });

    riftTeam = await createTeam(prisma, { gameId: "riftbound" });
    riftUser = await createUser(prisma);
    await addMembership(prisma, { teamId: riftTeam.id, userId: riftUser.id, role: "member" });

    // Flesh and Blood cards, including a card at two pitch values and an archived one.
    await createCard(prisma, {
      gameId: "flesh-and-blood",
      externalId: "aia1",
      name: "Absorb in Aether",
      pitch: 1,
    });
    await createCard(prisma, {
      gameId: "flesh-and-blood",
      externalId: "aia3",
      name: "Absorb in Aether",
      pitch: 3,
    });
    await createCard(prisma, {
      gameId: "flesh-and-blood",
      externalId: "cnc",
      name: "Command and Conquer",
      pitch: 1,
    });
    await createCard(prisma, {
      gameId: "flesh-and-blood",
      externalId: "snap",
      name: "Snapdragon Scalers",
      pitch: 2,
    });
    await createCard(prisma, {
      gameId: "flesh-and-blood",
      externalId: "old",
      name: "Removed Card",
      pitch: 1,
      archivedAt: new Date(),
    });

    // Riftbound cards (another game).
    await createCard(prisma, {
      gameId: "riftbound",
      externalId: "rift-a",
      name: "Absorb Rift",
      pitch: null,
    });

    await createFormat(prisma, {
      gameId: "flesh-and-blood",
      key: "cc",
      name: "Classic Constructed",
      sortOrder: 0,
    });
    await createFormat(prisma, {
      gameId: "riftbound",
      key: "standard",
      name: "Standard",
      sortOrder: 0,
    });

    await createHero(prisma, {
      gameId: "flesh-and-blood",
      name: "Dorinthea",
      classes: ["Warrior"],
    });
    await createHero(prisma, { gameId: "riftbound", name: "Rift Legend", classes: [] });
  });

  const asFab = (req: request.Test) =>
    req.set("x-test-user-id", fabUser.id).set("x-team-id", fabTeam.id);
  const asRift = (req: request.Test) =>
    req.set("x-test-user-id", riftUser.id).set("x-team-id", riftTeam.id);
  const http = () => request(app.getHttpServer());

  describe("GET /api/cards", () => {
    it("searches by name and returns active cards only, ordered by name", async () => {
      const response = await asFab(http().get("/api/cards"));
      expect(response.status).toBe(200);
      const names = response.body.data.map((card: { name: string }) => card.name);
      expect(names).not.toContain("Removed Card"); // archived excluded
      expect(names).toEqual([...names].sort()); // ordered by name asc
      expect(names).toContain("Command and Conquer");
    });

    it("filters by a name substring, case-insensitively", async () => {
      const response = await asFab(http().get("/api/cards").query({ query: "absorb" }));
      expect(response.status).toBe(200);
      expect(response.body.data.map((card: { name: string }) => card.name)).toEqual([
        "Absorb in Aether",
        "Absorb in Aether",
      ]);
    });

    it("distinguishes pitch values", async () => {
      const response = await asFab(
        http().get("/api/cards").query({ query: "Absorb in Aether", pitch: 1 }),
      );
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].pitch).toBe(1);
    });

    it("paginates with a keyset cursor over disjoint pages", async () => {
      const first = await asFab(http().get("/api/cards").query({ limit: 2 }));
      expect(first.body.data).toHaveLength(2);
      expect(first.body.nextCursor).not.toBeNull();

      const second = await asFab(
        http().get("/api/cards").query({ limit: 2, cursor: first.body.nextCursor }),
      );
      const firstIds = first.body.data.map((card: { id: string }) => card.id);
      const secondIds = second.body.data.map((card: { id: string }) => card.id);
      expect(firstIds.filter((id: string) => secondIds.includes(id))).toEqual([]);
    });

    it("never returns another game's cards (isolation)", async () => {
      const fabResponse = await asFab(http().get("/api/cards").query({ query: "Absorb" }));
      expect(
        fabResponse.body.data.every((card: { name: string }) => card.name !== "Absorb Rift"),
      ).toBe(true);

      const riftResponse = await asRift(http().get("/api/cards").query({ query: "Absorb" }));
      expect(riftResponse.body.data.map((card: { name: string }) => card.name)).toEqual([
        "Absorb Rift",
      ]);
    });

    it("requires the X-Team-Id header (400) and authentication (401)", async () => {
      const noTeam = await http().get("/api/cards").set("x-test-user-id", fabUser.id);
      expect(noTeam.status).toBe(400);

      const anonymous = await http().get("/api/cards").set("x-team-id", fabTeam.id);
      expect(anonymous.status).toBe(401);
    });
  });

  describe("GET /api/cards/:cardId", () => {
    it("returns a card in the active game", async () => {
      const card = await prisma.card.findFirst({ where: { externalId: "cnc" } });
      const response = await asFab(http().get(`/api/cards/${card!.id}`));
      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Command and Conquer");
    });

    it("returns 404 for a card in another game (no cross-game leak)", async () => {
      const riftCard = await prisma.card.findFirst({ where: { externalId: "rift-a" } });
      const response = await asFab(http().get(`/api/cards/${riftCard!.id}`));
      expect(response.status).toBe(404);
    });

    it("returns 404 for an archived card", async () => {
      const archived = await prisma.card.findFirst({ where: { externalId: "old" } });
      const response = await asFab(http().get(`/api/cards/${archived!.id}`));
      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/formats and /api/heroes", () => {
    it("returns only the active game's formats", async () => {
      const fab = await asFab(http().get("/api/formats"));
      expect(fab.body.data.map((format: { key: string }) => format.key)).toEqual(["cc"]);

      const rift = await asRift(http().get("/api/formats"));
      expect(rift.body.data.map((format: { key: string }) => format.key)).toEqual(["standard"]);
    });

    it("returns only the active game's heroes", async () => {
      const fab = await asFab(http().get("/api/heroes"));
      expect(fab.body.data.map((hero: { name: string }) => hero.name)).toEqual(["Dorinthea"]);

      const rift = await asRift(http().get("/api/heroes"));
      expect(rift.body.data.map((hero: { name: string }) => hero.name)).toEqual(["Rift Legend"]);
    });
  });

  describe("GET /api/card-data/version", () => {
    it("returns the active game's data provenance once synced", async () => {
      await prisma.cardDataVersion.create({
        data: {
          gameId: "flesh-and-blood",
          sourceName: "the-fab-cube/flesh-and-blood-cards",
          sourceUrl: "https://github.com/the-fab-cube/flesh-and-blood-cards",
          sourceVersion: "v8.2.0",
          lastSyncedAt: new Date("2026-07-12T00:00:00.000Z"),
          cardCount: 4,
        },
      });
      const response = await asFab(http().get("/api/card-data/version"));
      expect(response.status).toBe(200);
      expect(response.body.sourceVersion).toBe("v8.2.0");
      expect(response.body.cardCount).toBe(4);
    });

    it("returns 404 before the game has been synced", async () => {
      const response = await asRift(http().get("/api/card-data/version"));
      expect(response.status).toBe(404);
    });
  });
});
