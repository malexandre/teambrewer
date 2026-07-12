import { Injectable, Logger } from "@nestjs/common";

import type { GameAdapter, NormalizedCard, NormalizedHero } from "../games/game-adapter.interface.js";
import { GameAdapterRegistry } from "../games/game-adapter.registry.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** Outcome of syncing one game's card data. */
export interface CardSyncResult {
  gameId: string;
  cardCount: number;
  heroCount: number;
  sourceVersion: string;
}

/**
 * Imports a game's card reference data from its sanctioned open source into the
 * global `Card`/`Hero` tables (ADR-0007). Idempotent: fetch → map → transactional
 * upsert by (gameId, externalId), archiving rows absent from the new dataset
 * (never hard-deleting) and clearing archival for ones that reappear. Fetch and
 * map happen before the write transaction opens, so a source failure leaves the
 * previous dataset untouched.
 */
@Injectable()
export class CardSyncService {
  private readonly logger = new Logger(CardSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: GameAdapterRegistry,
  ) {}

  /** Sync every seeded game that has a registered adapter. */
  async syncAll(): Promise<CardSyncResult[]> {
    const games = await this.prisma.game.findMany({ select: { id: true, key: true } });
    const results: CardSyncResult[] = [];
    for (const game of games) {
      if (!this.registry.has(game.key)) {
        this.logger.warn(`No adapter registered for game "${game.key}" (${game.id}); skipping sync.`);
        continue;
      }
      results.push(await this.syncGame(game.id));
    }
    return results;
  }

  /** Sync a single game's card data by its `Game.id`. */
  async syncGame(gameId: string): Promise<CardSyncResult> {
    const game = await this.prisma.game.findUnique({ where: { id: gameId }, select: { id: true, key: true } });
    if (!game) {
      throw new Error(`Cannot sync unknown game "${gameId}".`);
    }
    const adapter: GameAdapter = this.registry.get(game.key);
    const description = adapter.describeSource();

    // Fetch + map BEFORE any writes: a source failure must leave data untouched.
    const rawRecords = await adapter.fetchCardSource();
    if (rawRecords.length === 0) {
      // Sanity floor: never archive an entire game's cards from an empty fetch.
      throw new Error(`Refusing to sync game "${gameId}": the source returned no records.`);
    }
    const cards = rawRecords.map((record) => adapter.mapCard(record));
    const heroes = adapter.deriveHeroes(rawRecords);

    this.logger.log(
      `Syncing ${cards.length} cards and ${heroes.length} heroes for game "${gameId}" ` +
        `(${description.sourceName} ${description.sourceVersion}).`,
    );

    const syncedAt = new Date();
    await this.prisma.$transaction(
      async (transaction) => {
        await upsertCards(transaction, gameId, cards, syncedAt);
        await upsertHeroes(transaction, gameId, heroes, syncedAt);
        await transaction.cardDataVersion.upsert({
          where: { gameId },
          create: {
            gameId,
            sourceName: description.sourceName,
            sourceUrl: description.sourceUrl,
            sourceVersion: description.sourceVersion,
            lastSyncedAt: syncedAt,
            cardCount: cards.length,
          },
          update: {
            sourceName: description.sourceName,
            sourceUrl: description.sourceUrl,
            sourceVersion: description.sourceVersion,
            lastSyncedAt: syncedAt,
            cardCount: cards.length,
          },
        });
      },
      // A full re-sync is a large sequential upsert; give it room beyond the 5s default.
      { timeout: 120_000, maxWait: 20_000 },
    );

    return {
      gameId,
      cardCount: cards.length,
      heroCount: heroes.length,
      sourceVersion: description.sourceVersion,
    };
  }
}

/** A subset of the Prisma client sufficient for the sync writes (the tx handle). */
type SyncTransaction = Pick<PrismaService, "card" | "hero" | "cardDataVersion">;

async function upsertCards(
  transaction: SyncTransaction,
  gameId: string,
  cards: NormalizedCard[],
  syncedAt: Date,
): Promise<void> {
  const seenExternalIds: string[] = [];
  for (const card of cards) {
    seenExternalIds.push(card.externalId);
    await transaction.card.upsert({
      where: { gameId_externalId: { gameId, externalId: card.externalId } },
      create: {
        gameId,
        externalId: card.externalId,
        name: card.name,
        pitch: card.pitch,
        imageUrl: card.imageUrl,
      },
      // Reappearing cards are un-archived (archivedAt cleared).
      update: { name: card.name, pitch: card.pitch, imageUrl: card.imageUrl, archivedAt: null },
    });
  }
  await archiveMissing(transaction.card, gameId, seenExternalIds, syncedAt);
}

async function upsertHeroes(
  transaction: SyncTransaction,
  gameId: string,
  heroes: NormalizedHero[],
  syncedAt: Date,
): Promise<void> {
  const seenExternalIds: string[] = [];
  for (const hero of heroes) {
    seenExternalIds.push(hero.externalId);
    await transaction.hero.upsert({
      where: { gameId_externalId: { gameId, externalId: hero.externalId } },
      create: {
        gameId,
        externalId: hero.externalId,
        name: hero.name,
        classes: hero.classes,
        talents: hero.talents,
        startingLife: hero.startingLife,
        imageUrl: hero.imageUrl,
      },
      update: {
        name: hero.name,
        classes: hero.classes,
        talents: hero.talents,
        startingLife: hero.startingLife,
        imageUrl: hero.imageUrl,
        archivedAt: null,
      },
    });
  }
  await archiveMissing(transaction.hero, gameId, seenExternalIds, syncedAt);
}

/** Soft-delete rows for the game whose externalId is not in the new dataset. */
async function archiveMissing(
  model: {
    updateMany: (args: {
      where: { gameId: string; externalId: { notIn: string[] }; archivedAt: null };
      data: { archivedAt: Date };
    }) => Promise<unknown>;
  },
  gameId: string,
  seenExternalIds: string[],
  syncedAt: Date,
): Promise<void> {
  await model.updateMany({
    where: { gameId, externalId: { notIn: seenExternalIds }, archivedAt: null },
    data: { archivedAt: syncedAt },
  });
}
