import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { GamesModule } from "../games/games.module.js";
import { CardSyncScheduler } from "./card-sync.scheduler.js";
import { CardSyncService } from "./card-sync.service.js";
import { ReferenceDataSeedService } from "./reference-data-seed.service.js";

/**
 * Card reference data: sync + (later) search/reference endpoints. The scheduled
 * sync is opt-in via `CARD_SYNC_ENABLED=true` — off by default so tests, the CLI,
 * and the seed never register a cron. The manual/CLI sync (`card:sync`) and the
 * instance-admin endpoint always work regardless.
 */
const cardSyncScheduleEnabled = process.env["CARD_SYNC_ENABLED"] === "true";

@Module({
  imports: [GamesModule, ...(cardSyncScheduleEnabled ? [ScheduleModule.forRoot()] : [])],
  providers: [
    CardSyncService,
    ReferenceDataSeedService,
    ...(cardSyncScheduleEnabled ? [CardSyncScheduler] : []),
  ],
  exports: [CardSyncService, ReferenceDataSeedService],
})
export class CardsModule {}
