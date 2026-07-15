import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import {
  createDeckSchema,
  createIterationEntrySchema,
  type DeckCardObservationsResponse,
  type DeckDetail,
  type DeckListResponse,
  deckListQuerySchema,
  type DeckMetaReadinessResponse,
  deckMetaReadinessQuerySchema,
  deckStatusChangeSchema,
  type IterationEntry,
  type IterationEntryList,
  recognizeDeckUrlRequestSchema,
  type RecognizeDeckUrlResponse,
  updateDeckSchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { DecksService } from "./decks.service.js";

/**
 * Team-scoped deck endpoints (docs/features/decks.md). Every route is guarded by
 * {@link TeamContextGuard}; the verified team comes from `@CurrentTeam()`, never
 * the body. Request bodies/queries are validated at the boundary with the shared
 * Zod schemas (a `status` key in a general update is rejected — status changes go
 * through the dedicated status route). Decks are links (ADR-0002): no contents.
 */
@Controller("decks")
@UseGuards(TeamContextGuard)
export class DecksController {
  constructor(private readonly decks: DecksService) {}

  @Get()
  list(@CurrentTeam() team: TeamContext, @Query() query: unknown): Promise<DeckListResponse> {
    return this.decks.list(team, deckListQuerySchema.parse(query));
  }

  @Post()
  create(@CurrentTeam() team: TeamContext, @Body() body: unknown): Promise<DeckDetail> {
    return this.decks.create(team, createDeckSchema.parse(body));
  }

  @Post("recognize-url")
  @HttpCode(200)
  recognizeUrl(@CurrentTeam() team: TeamContext, @Body() body: unknown): RecognizeDeckUrlResponse {
    const { url } = recognizeDeckUrlRequestSchema.parse(body);
    return { recognized: this.decks.recognizeUrl(team.gameId, url) };
  }

  @Get(":deckId")
  getDeck(@CurrentTeam() team: TeamContext, @Param("deckId") deckId: string): Promise<DeckDetail> {
    return this.decks.getDeck(team, deckId);
  }

  @Patch(":deckId")
  update(
    @CurrentTeam() team: TeamContext,
    @Param("deckId") deckId: string,
    @Body() body: unknown,
  ): Promise<DeckDetail> {
    return this.decks.update(team, deckId, updateDeckSchema.parse(body));
  }

  @Delete(":deckId")
  @HttpCode(204)
  archive(@CurrentTeam() team: TeamContext, @Param("deckId") deckId: string): Promise<void> {
    return this.decks.archive(team, deckId);
  }

  @Patch(":deckId/status")
  changeStatus(
    @CurrentTeam() team: TeamContext,
    @Param("deckId") deckId: string,
    @Body() body: unknown,
  ): Promise<DeckDetail> {
    const { status } = deckStatusChangeSchema.parse(body);
    return this.decks.changeStatus(team, deckId, status);
  }

  @Get(":deckId/meta-readiness")
  metaReadiness(
    @CurrentTeam() team: TeamContext,
    @Param("deckId") deckId: string,
    @Query() query: unknown,
  ): Promise<DeckMetaReadinessResponse> {
    return this.decks.getMetaReadiness(team, deckId, deckMetaReadinessQuerySchema.parse(query));
  }

  @Get(":deckId/card-observations")
  cardObservations(
    @CurrentTeam() team: TeamContext,
    @Param("deckId") deckId: string,
  ): Promise<DeckCardObservationsResponse> {
    return this.decks.getCardObservations(team, deckId);
  }

  @Get(":deckId/iteration-entries")
  listIterations(
    @CurrentTeam() team: TeamContext,
    @Param("deckId") deckId: string,
  ): Promise<IterationEntryList> {
    return this.decks.listIterations(team, deckId);
  }

  @Post(":deckId/iteration-entries")
  addIteration(
    @CurrentTeam() team: TeamContext,
    @Param("deckId") deckId: string,
    @Body() body: unknown,
  ): Promise<IterationEntry> {
    const { body: entryBody } = createIterationEntrySchema.parse(body);
    return this.decks.addIteration(team, deckId, entryBody);
  }
}
