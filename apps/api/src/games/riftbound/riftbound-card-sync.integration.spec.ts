import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../../test/database.js";
import { createGame, createTestPrismaClient } from "../../../test/factories.js";
import { CardSyncService } from "../../cards/card-sync.service.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { RawCardRecord } from "../game-adapter.interface.js";
import { GameAdapterRegistry } from "../game-adapter.registry.js";
import type { PrismaService } from "../../prisma/prisma.service.js";
import { RiftboundAdapter } from "./riftbound.adapter.js";
import { RIFTBOUND_CARD_FIXTURE } from "./riftbound.fixture.js";
import type { RiftcodexCardSourceClient } from "./riftcodex-card-source.client.js";

const GAME_ID = "riftbound";

/**
 * Proves the phase-02 card-sync job drives the new Riftbound adapter with no
 * job changes: it fetches → maps → upserts by (gameId, externalId), derives
 * Legends, records the data version, and is idempotent. Uses a stubbed source
 * client returning the committed fixture — no network.
 */
describe("Riftbound card sync (integration)", () => {
  let prisma: PrismaClient;
  let sourceRecords: RawCardRecord[];
  let registry: GameAdapterRegistry;
  let service: CardSyncService;

  beforeAll(() => {
    prisma = createTestPrismaClient();
    const stubSource = {
      fetchRawCards: async () => sourceRecords,
      sourceUrl: "https://api.riftcodex.test",
      sourceVersion: "riftcodex-test",
    } as unknown as RiftcodexCardSourceClient;
    registry = new GameAdapterRegistry([new RiftboundAdapter(stubSource)]);
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
    await createGame(prisma, { id: GAME_ID, key: "riftbound", name: "Riftbound" });
    sourceRecords = [...RIFTBOUND_CARD_FIXTURE];
  });

  it("resolves the Riftbound adapter from the registry by game key", () => {
    expect(registry.has("riftbound")).toBe(true);
    expect(registry.get("riftbound").identityLabel).toBe("Legend");
  });

  it("imports cards and Legends and records the data version (global, no teamId)", async () => {
    const result = await service.syncGame(GAME_ID);

    expect(result.cardCount).toBe(RIFTBOUND_CARD_FIXTURE.length);
    expect(result.heroCount).toBe(1);

    const cards = await prisma.card.findMany({ where: { gameId: GAME_ID } });
    expect(cards).toHaveLength(RIFTBOUND_CARD_FIXTURE.length);
    expect(cards.every((card) => card.pitch === null)).toBe(true);

    const legends = await prisma.hero.findMany({ where: { gameId: GAME_ID } });
    expect(legends.map((legend) => legend.name)).toEqual(["Yasuo, the Unforgiven"]);
    const yasuo = legends[0]!;
    expect(yasuo.classes).toEqual(["Fury", "Order"]);
    expect(yasuo.talents).toEqual(["Ionia"]);

    const version = await prisma.cardDataVersion.findUnique({ where: { gameId: GAME_ID } });
    expect(version?.sourceName).toBe("riftcodex");
    expect(version?.sourceVersion).toBe("riftcodex-test");
    expect(version?.cardCount).toBe(RIFTBOUND_CARD_FIXTURE.length);
  });

  it("is idempotent: a second sync produces the same rows with stable ids", async () => {
    await service.syncGame(GAME_ID);
    const first = await prisma.card.findMany({
      where: { gameId: GAME_ID },
      orderBy: { externalId: "asc" },
    });

    await service.syncGame(GAME_ID);
    const second = await prisma.card.findMany({
      where: { gameId: GAME_ID },
      orderBy: { externalId: "asc" },
    });

    expect(second).toHaveLength(first.length);
    expect(second.map((card) => card.id)).toEqual(first.map((card) => card.id));
    expect(second.map((card) => card.externalId)).toEqual(first.map((card) => card.externalId));
  });
});
