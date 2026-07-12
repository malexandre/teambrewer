import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient } from "../../test/factories.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { FabCardSourceClient } from "../games/flesh-and-blood/fab-card-source.client.js";
import { FleshAndBloodAdapter } from "../games/flesh-and-blood/flesh-and-blood.adapter.js";
import { GameAdapterRegistry } from "../games/game-adapter.registry.js";
import { RiftboundAdapter } from "../games/riftbound/riftbound.adapter.js";
import { RiftcodexCardSourceClient } from "../games/riftbound/riftcodex-card-source.client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { ReferenceDataSeedService } from "./reference-data-seed.service.js";

describe("ReferenceDataSeedService (integration)", () => {
  let prisma: PrismaClient;
  let service: ReferenceDataSeedService;

  beforeAll(() => {
    prisma = createTestPrismaClient();
    // Both registered games, mirroring GamesModule — the seed iterates the catalog.
    const registry = new GameAdapterRegistry([
      new FleshAndBloodAdapter(new FabCardSourceClient()),
      new RiftboundAdapter(new RiftcodexCardSourceClient()),
    ]);
    service = new ReferenceDataSeedService(prisma as unknown as PrismaService, registry);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    const client = createDatabaseClient();
    await client.connect();
    await resetDatabase(client);
    await client.end();
  });

  it("seeds every catalog game and its formats", async () => {
    const result = await service.seed();

    expect(result.gamesSeeded).toBe(2);
    expect(result.formatsSeeded).toBeGreaterThan(0);

    const fab = await prisma.game.findUnique({ where: { id: "flesh-and-blood" } });
    expect(fab?.key).toBe("flesh_and_blood");
    const riftbound = await prisma.game.findUnique({ where: { id: "riftbound" } });
    expect(riftbound?.key).toBe("riftbound");

    const fabFormats = await prisma.format.findMany({ where: { gameId: "flesh-and-blood" } });
    expect(fabFormats.map((format) => format.key)).toContain("cc");
    expect(fabFormats.map((format) => format.key)).toContain("blitz");

    const riftboundFormats = await prisma.format.findMany({ where: { gameId: "riftbound" } });
    expect(riftboundFormats.map((format) => format.key)).toContain("standard");
  });

  it("is idempotent: re-seeding produces no duplicates and stable rows", async () => {
    await service.seed();
    const firstFormats = await prisma.format.findMany({
      where: { gameId: "flesh-and-blood" },
      orderBy: { key: "asc" },
    });

    await service.seed();
    const secondFormats = await prisma.format.findMany({
      where: { gameId: "flesh-and-blood" },
      orderBy: { key: "asc" },
    });

    expect(secondFormats).toHaveLength(firstFormats.length);
    expect(secondFormats.map((format) => format.id)).toEqual(
      firstFormats.map((format) => format.id),
    );
    expect(await prisma.game.count()).toBe(2);
  });
});
