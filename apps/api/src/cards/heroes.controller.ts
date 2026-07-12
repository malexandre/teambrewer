import { Controller, Get, UseGuards } from "@nestjs/common";

import { type HeroList } from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { CardsService } from "./cards.service.js";

/** The active team's game's heroes/identities (drives pickers, deck fields later). */
@Controller("heroes")
@UseGuards(TeamContextGuard)
export class HeroesController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  list(@CurrentTeam() team: TeamContext): Promise<HeroList> {
    return this.cards.listHeroes(team.gameId);
  }
}
