import { Controller, Get, UseGuards } from "@nestjs/common";

import { type CardDataVersion } from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { CardsService } from "./cards.service.js";

/** Provenance of the active team's game's card data ("card data as of …"). */
@Controller("card-data")
@UseGuards(TeamContextGuard)
export class CardDataController {
  constructor(private readonly cards: CardsService) {}

  @Get("version")
  getVersion(@CurrentTeam() team: TeamContext): Promise<CardDataVersion> {
    return this.cards.getCardDataVersion(team.gameId);
  }
}
