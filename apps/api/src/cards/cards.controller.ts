import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";

import {
  cardSearchQuerySchema,
  type CardSearchResponse,
  type CardSummary,
} from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { CardsService } from "./cards.service.js";

/**
 * Card search/autocomplete and detail for the active team's game. Reads are
 * filtered by the verified `gameId` from {@link TeamContextGuard} — a team never
 * sees another game's cards, and never supplies the game itself.
 */
@Controller("cards")
@UseGuards(TeamContextGuard)
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  search(@CurrentTeam() team: TeamContext, @Query() query: unknown): Promise<CardSearchResponse> {
    return this.cards.search(team.gameId, cardSearchQuerySchema.parse(query));
  }

  @Get(":cardId")
  getCard(@CurrentTeam() team: TeamContext, @Param("cardId") cardId: string): Promise<CardSummary> {
    return this.cards.getCard(team.gameId, cardId);
  }
}
