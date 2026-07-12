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
  createMatchupGamePlanSchema,
  type MatchupGamePlan,
  type MatchupGamePlanListResponse,
  matchupGamePlanListQuerySchema,
  updateMatchupGamePlanSchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { GamePlansService } from "./game-plans.service.js";

/**
 * Team-scoped matchup game-plan endpoints (docs/features/gameplans-and-deck-selection.md).
 * Every route is guarded by {@link TeamContextGuard}; the verified team comes from
 * `@CurrentTeam()`, never the body. Bodies/queries are validated at the boundary with
 * the shared Zod schemas. Game-plans are shared team knowledge: any member creates or
 * edits; only a team-admin archives (enforced in the service).
 */
@Controller("game-plans")
@UseGuards(TeamContextGuard)
export class GamePlansController {
  constructor(private readonly gamePlans: GamePlansService) {}

  @Get()
  list(@Query() query: unknown): Promise<MatchupGamePlanListResponse> {
    return this.gamePlans.list(matchupGamePlanListQuerySchema.parse(query));
  }

  @Post()
  create(@CurrentTeam() team: TeamContext, @Body() body: unknown): Promise<MatchupGamePlan> {
    return this.gamePlans.create(team, createMatchupGamePlanSchema.parse(body));
  }

  @Get(":gamePlanId")
  getGamePlan(@Param("gamePlanId") gamePlanId: string): Promise<MatchupGamePlan> {
    return this.gamePlans.getGamePlan(gamePlanId);
  }

  @Patch(":gamePlanId")
  update(
    @CurrentTeam() team: TeamContext,
    @Param("gamePlanId") gamePlanId: string,
    @Body() body: unknown,
  ): Promise<MatchupGamePlan> {
    return this.gamePlans.update(team, gamePlanId, updateMatchupGamePlanSchema.parse(body));
  }

  @Delete(":gamePlanId")
  @HttpCode(204)
  archive(
    @CurrentTeam() team: TeamContext,
    @Param("gamePlanId") gamePlanId: string,
  ): Promise<void> {
    return this.gamePlans.archive(team, gamePlanId);
  }
}
