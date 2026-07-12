import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { RoleGuard } from "../common/role.guard.js";
import { TenancyModule } from "../tenancy/tenancy.module.js";
import { GamesModule } from "../games/games.module.js";
import { AdminCardsController } from "./admin-cards.controller.js";
import { CardDataController } from "./card-data.controller.js";
import { CardSyncScheduler } from "./card-sync.scheduler.js";
import { CardSyncService } from "./card-sync.service.js";
import { CardsController } from "./cards.controller.js";
import { CardsService } from "./cards.service.js";
import { FormatsController } from "./formats.controller.js";
import { HeroesController } from "./heroes.controller.js";
import { ReferenceDataSeedService } from "./reference-data-seed.service.js";

/**
 * Card reference data: sync + (later) search/reference endpoints. The scheduled
 * sync is opt-in via `CARD_SYNC_ENABLED=true` — off by default so tests, the CLI,
 * and the seed never register a cron. The manual/CLI sync (`card:sync`) and the
 * instance-admin endpoint always work regardless.
 */
const cardSyncScheduleEnabled = process.env["CARD_SYNC_ENABLED"] === "true";

@Module({
  imports: [GamesModule, TenancyModule, ...(cardSyncScheduleEnabled ? [ScheduleModule.forRoot()] : [])],
  controllers: [
    CardsController,
    FormatsController,
    HeroesController,
    CardDataController,
    AdminCardsController,
  ],
  providers: [
    CardsService,
    CardSyncService,
    ReferenceDataSeedService,
    RoleGuard,
    ...(cardSyncScheduleEnabled ? [CardSyncScheduler] : []),
  ],
  exports: [CardSyncService, ReferenceDataSeedService],
})
export class CardsModule {}
