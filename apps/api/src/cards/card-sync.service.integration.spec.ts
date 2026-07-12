import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createGame, createTestPrismaClient } from "../../test/factories.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { FabCardSourceClient } from "../games/flesh-and-blood/fab-card-source.client.js";
import { FleshAndBloodAdapter } from "../games/flesh-and-blood/flesh-and-blood.adapter.js";
import { FLESH_AND_BLOOD_CARD_FIXTURE } from "../games/flesh-and-blood/flesh-and-blood.fixture.js";
import type { RawCardRecord } from "../games/game-adapter.interface.js";
import { GameAdapterRegistry } from "../games/game-adapter.registry.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { CardSyncService } from "./card-sync.service.js";

const GAME_ID = "flesh-and-blood";

describe("CardSyncService (integration)", () => {
  let prisma: PrismaClient;
  let sourceRecords: RawCardRecord[];
  let service: CardSyncService;

  beforeAll(() => {
    prisma = createTestPrismaClient();
    // A stub source the FaB adapter fetches from — no network. `sourceRecords`
    // is reassigned per test to simulate the dataset changing between syncs.
    const stubSource = {
      fetchRawCards: async () => sourceRecords,
      sourceUrl: "https://source.test/flesh-and-blood/cards.json",
      sourceVersion: "v-test",
    } as unknown as FabCardSourceClient;
    const registry = new GameAdapterRegistry([new FleshAndBloodAdapter(stubSource)]);
    service = new CardSyncService(prisma as unknown as PrismaService, registry);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    const client = createDatabaseClient();
    await client.connect();
    await resetDatabase(client);
    await client.end();
    await createGame(prisma, { id: GAME_ID, key: "flesh_and_blood", name: "Flesh and Blood" });
    sourceRecords = [...FLESH_AND_BLOOD_CARD_FIXTURE];
  });

  it("imports cards and heroes and records the data version", async () => {
    const result = await service.syncGame(GAME_ID);

    expect(result.cardCount).toBe(FLESH_AND_BLOOD_CARD_FIXTURE.length);
    expect(result.heroCount).toBe(2);

    const cards = await prisma.card.findMany({ where: { gameId: GAME_ID } });
    expect(cards).toHaveLength(FLESH_AND_BLOOD_CARD_FIXTURE.length);
    const heroes = await prisma.hero.findMany({ where: { gameId: GAME_ID } });
    expect(heroes.map((hero) => hero.name).sort()).toEqual(["Arakni", "Briar, Warden of Thorns"]);

    const version = await prisma.cardDataVersion.findUnique({ where: { gameId: GAME_ID } });
    expect(version?.sourceVersion).toBe("v-test");
    expect(version?.cardCount).toBe(FLESH_AND_BLOOD_CARD_FIXTURE.length);
  });

  it("is idempotent: a second sync produces the same rows with stable ids", async () => {
    await service.syncGame(GAME_ID);
    const first = await prisma.card.findMany({ where: { gameId: GAME_ID }, orderBy: { externalId: "asc" } });

    await service.syncGame(GAME_ID);
    const second = await prisma.card.findMany({ where: { gameId: GAME_ID }, orderBy: { externalId: "asc" } });

    expect(second).toHaveLength(first.length);
    expect(second.map((card) => card.id)).toEqual(first.map((card) => card.id));
    expect(second.map((card) => card.externalId)).toEqual(first.map((card) => card.externalId));
  });

  it("archives a card removed upstream and restores it when it reappears", async () => {
    await service.syncGame(GAME_ID);

    // Remove one card from the dataset and re-sync.
    sourceRecords = FLESH_AND_BLOOD_CARD_FIXTURE.filter(
      (record) => (record as { unique_id: string }).unique_id !== "absorb-aether-3",
    );
    await service.syncGame(GAME_ID);

    const removed = await prisma.card.findUnique({
      where: { gameId_externalId: { gameId: GAME_ID, externalId: "absorb-aether-3" } },
    });
    expect(removed).not.toBeNull();
    expect(removed?.archivedAt).not.toBeNull();

    const stillPresent = await prisma.card.findUnique({
      where: { gameId_externalId: { gameId: GAME_ID, externalId: "absorb-aether-1" } },
    });
    expect(stillPresent?.archivedAt).toBeNull();

    // Restore the full dataset — the card is un-archived.
    sourceRecords = [...FLESH_AND_BLOOD_CARD_FIXTURE];
    await service.syncGame(GAME_ID);
    const restored = await prisma.card.findUnique({
      where: { gameId_externalId: { gameId: GAME_ID, externalId: "absorb-aether-3" } },
    });
    expect(restored?.archivedAt).toBeNull();
  });

  it("refuses to sync an empty dataset and leaves existing data untouched", async () => {
    await service.syncGame(GAME_ID);
    sourceRecords = [];

    await expect(service.syncGame(GAME_ID)).rejects.toThrow(/no records/);

    const cards = await prisma.card.findMany({ where: { gameId: GAME_ID } });
    expect(cards).toHaveLength(FLESH_AND_BLOOD_CARD_FIXTURE.length);
    expect(cards.every((card) => card.archivedAt === null)).toBe(true);
  });

  it("syncAll syncs every game that has a registered adapter", async () => {
    const results = await service.syncAll();
    expect(results).toHaveLength(1);
    expect(results[0]?.gameId).toBe(GAME_ID);
  });
});
