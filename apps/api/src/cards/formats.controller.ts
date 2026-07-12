import { Controller, Get, UseGuards } from "@nestjs/common";

import { type FormatList } from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { CardsService } from "./cards.service.js";

/** The active team's game's formats (reference context; drives pickers). */
@Controller("formats")
@UseGuards(TeamContextGuard)
export class FormatsController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  list(@CurrentTeam() team: TeamContext): Promise<FormatList> {
    return this.cards.listFormats(team.gameId);
  }
}
