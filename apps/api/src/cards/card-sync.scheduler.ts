import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { CardSyncService } from "./card-sync.service.js";

/** Cron expression for the scheduled sync (default: daily at 04:00). */
const CARD_SYNC_CRON = process.env["CARD_SYNC_CRON"] ?? "0 4 * * *";

/**
 * Runs the card sync on a schedule. Only registered when
 * `CARD_SYNC_ENABLED === "true"` (see CardsModule), so it never fires in tests.
 * Failures are logged and swallowed — a failed scheduled run must not crash the
 * API, and the sync itself leaves prior data intact on error.
 */
@Injectable()
export class CardSyncScheduler {
  private readonly logger = new Logger(CardSyncScheduler.name);

  constructor(private readonly cardSync: CardSyncService) {}

  @Cron(CARD_SYNC_CRON)
  async runScheduledSync(): Promise<void> {
    this.logger.log("Running scheduled card sync");
    try {
      const results = await this.cardSync.syncAll();
      this.logger.log(
        `Scheduled card sync complete: ${results.map((result) => `${result.gameId}=${result.cardCount}`).join(", ")}`,
      );
    } catch (error) {
      this.logger.error(
        "Scheduled card sync failed; previous data is unchanged.",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
