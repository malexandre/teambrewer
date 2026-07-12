import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { CardSyncService } from "./cards/card-sync.service.js";

/**
 * `card:sync` command entrypoint. Boots a headless application context (no HTTP
 * server), runs the card sync for one game (`node dist/main.cli.js <gameId>`) or
 * all games (no argument), prints a summary, and exits. Uses the same sanctioned
 * source + idempotent upsert as the scheduled job.
 */
async function runCardSync(): Promise<void> {
  const application = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });
  try {
    const cardSync = application.get(CardSyncService);
    const gameId = process.argv[2];
    const results = gameId ? [await cardSync.syncGame(gameId)] : await cardSync.syncAll();
    if (results.length === 0) {
      console.log("No games with a registered adapter to sync.");
    }
    for (const result of results) {
      console.log(
        `Synced ${result.cardCount} cards and ${result.heroCount} heroes for "${result.gameId}" ` +
          `(source version ${result.sourceVersion}).`,
      );
    }
  } finally {
    await application.close();
  }
}

runCardSync()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Card sync failed:", error);
    process.exit(1);
  });
