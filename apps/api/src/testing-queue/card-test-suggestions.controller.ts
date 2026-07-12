import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";

import {
  type CardTestSuggestion,
  type CardTestSuggestionListResponse,
  cardTestSuggestionListQuerySchema,
  createCardTestSuggestionSchema,
  updateCardTestSuggestionSchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { CardTestSuggestionsService } from "./card-test-suggestions.service.js";

/**
 * Team-scoped card-test-suggestion endpoints (docs/features/testing-queue.md). Every
 * route is guarded by {@link TeamContextGuard}; the verified team comes from
 * `@CurrentTeam()`, never the body. Bodies/queries are validated at the boundary with
 * the shared Zod schemas. Voting is upvote-only via `PUT/DELETE .../votes/me`, with
 * the voter taken from the verified context.
 */
@Controller("card-test-suggestions")
@UseGuards(TeamContextGuard)
export class CardTestSuggestionsController {
  constructor(private readonly suggestions: CardTestSuggestionsService) {}

  @Get()
  list(
    @CurrentTeam() team: TeamContext,
    @Query() query: unknown,
  ): Promise<CardTestSuggestionListResponse> {
    return this.suggestions.list(team, cardTestSuggestionListQuerySchema.parse(query));
  }

  @Post()
  create(@CurrentTeam() team: TeamContext, @Body() body: unknown): Promise<CardTestSuggestion> {
    return this.suggestions.create(team, createCardTestSuggestionSchema.parse(body));
  }

  @Patch(":suggestionId")
  update(
    @CurrentTeam() team: TeamContext,
    @Param("suggestionId") suggestionId: string,
    @Body() body: unknown,
  ): Promise<CardTestSuggestion> {
    return this.suggestions.update(team, suggestionId, updateCardTestSuggestionSchema.parse(body));
  }

  @Delete(":suggestionId")
  @HttpCode(204)
  archive(
    @CurrentTeam() team: TeamContext,
    @Param("suggestionId") suggestionId: string,
  ): Promise<void> {
    return this.suggestions.archive(team, suggestionId);
  }

  @Put(":suggestionId/votes/me")
  castVote(
    @CurrentTeam() team: TeamContext,
    @Param("suggestionId") suggestionId: string,
  ): Promise<CardTestSuggestion> {
    return this.suggestions.castVote(team, suggestionId);
  }

  @Delete(":suggestionId/votes/me")
  @HttpCode(204)
  retractVote(
    @CurrentTeam() team: TeamContext,
    @Param("suggestionId") suggestionId: string,
  ): Promise<void> {
    return this.suggestions.retractVote(team, suggestionId);
  }
}
