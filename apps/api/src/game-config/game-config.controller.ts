import { Controller, Get, UseGuards } from "@nestjs/common";
import type { GameConfig } from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { GameConfigService } from "./game-config.service.js";

/** Per-game UI config for the active team (docs/architecture/game-abstraction.md). */
@Controller("game-config")
@UseGuards(TeamContextGuard)
export class GameConfigController {
  constructor(private readonly gameConfig: GameConfigService) {}

  @Get()
  get(@CurrentTeam() team: TeamContext): Promise<GameConfig> {
    return this.gameConfig.getForTeam(team);
  }
}
