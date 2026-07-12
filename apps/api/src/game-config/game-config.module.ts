import { Module } from "@nestjs/common";

import { GamesModule } from "../games/games.module.js";
import { TenancyModule } from "../tenancy/tenancy.module.js";
import { GameConfigController } from "./game-config.controller.js";
import { GameConfigService } from "./game-config.service.js";

/** Exposes per-game UI config resolved from the team's GameAdapter. */
@Module({
  imports: [TenancyModule, GamesModule],
  controllers: [GameConfigController],
  providers: [GameConfigService],
})
export class GameConfigModule {}
