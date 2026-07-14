import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { type HeroList, heroListQuerySchema } from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { CardsService } from "./cards.service.js";

/**
 * The active team's game's heroes/identities (drives the identity pickers). An
 * optional `?formatId=` narrows the list to heroes legal in that format
 * (coverage-aware server-side — see {@link CardsService.listHeroes}).
 */
@Controller("heroes")
@UseGuards(TeamContextGuard)
export class HeroesController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  list(@CurrentTeam() team: TeamContext, @Query() query: unknown): Promise<HeroList> {
    const { formatId } = heroListQuerySchema.parse(query);
    return this.cards.listHeroes(team.gameId, formatId);
  }
}
