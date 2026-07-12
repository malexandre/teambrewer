import { Injectable, Logger } from "@nestjs/common";

import { GAME_CATALOG } from "../games/game-catalog.js";
import { GameAdapterRegistry } from "../games/game-adapter.registry.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** Outcome of seeding the network-free reference catalog. */
export interface ReferenceDataSeedResult {
  gamesSeeded: number;
  formatsSeeded: number;
}

/**
 * Seeds the network-free reference catalog: the Game rows and each game's Format
 * rows (from the adapter's listFormats). Idempotent — upserts by stable keys, so
 * re-running changes nothing. Heroes and Cards are NOT seeded here; they come
 * from the card sync, which needs the dataset.
 */
@Injectable()
export class ReferenceDataSeedService {
  private readonly logger = new Logger(ReferenceDataSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: GameAdapterRegistry,
  ) {}

  async seed(): Promise<ReferenceDataSeedResult> {
    let formatsSeeded = 0;
    for (const game of GAME_CATALOG) {
      await this.prisma.game.upsert({
        where: { id: game.id },
        create: { id: game.id, key: game.key, name: game.name },
        update: { key: game.key, name: game.name },
      });

      if (!this.registry.has(game.key)) {
        this.logger.warn(`No adapter for game "${game.key}"; seeded the game but not its formats.`);
        continue;
      }
      for (const format of this.registry.get(game.key).listFormats()) {
        await this.prisma.format.upsert({
          where: { gameId_key: { gameId: game.id, key: format.key } },
          create: {
            gameId: game.id,
            key: format.key,
            name: format.name,
            isConstructed: format.isConstructed,
            sortOrder: format.sortOrder,
          },
          update: {
            name: format.name,
            isConstructed: format.isConstructed,
            sortOrder: format.sortOrder,
          },
        });
        formatsSeeded += 1;
      }
    }
    this.logger.log(`Seeded ${GAME_CATALOG.length} game(s) and ${formatsSeeded} format(s).`);
    return { gamesSeeded: GAME_CATALOG.length, formatsSeeded };
  }
}
