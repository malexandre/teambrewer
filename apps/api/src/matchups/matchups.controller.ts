import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import {
  type MatchupCoverageResponse,
  type MatchupListResponse,
  type MatchupMatrixResponse,
  matchupCoverageQuerySchema,
  matchupMatrixQuerySchema,
  matchupQuerySchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { MatchupsService } from "./matchups.service.js";

/**
 * Read-only matchup-aggregation endpoints (docs/features/confidence-and-matchups.md).
 * Every route is guarded by {@link TeamContextGuard}; the verified team comes from
 * `@CurrentTeam()`, never a client-supplied value. Queries are validated at the
 * boundary with the shared Zod schemas. All aggregates are derived from the team's
 * `GameLog`s and are visible to any team member (aggregates are read-only for all
 * roles).
 */
@Controller("matchups")
@UseGuards(TeamContextGuard)
export class MatchupsController {
  constructor(private readonly matchups: MatchupsService) {}

  @Get()
  list(@CurrentTeam() team: TeamContext, @Query() query: unknown): Promise<MatchupListResponse> {
    return this.matchups.list(team, matchupQuerySchema.parse(query));
  }

  @Get("matrix")
  matrix(
    @CurrentTeam() team: TeamContext,
    @Query() query: unknown,
  ): Promise<MatchupMatrixResponse> {
    return this.matchups.matrix(team, matchupMatrixQuerySchema.parse(query));
  }

  @Get("coverage")
  coverage(@Query() query: unknown): Promise<MatchupCoverageResponse> {
    return this.matchups.coverage(matchupCoverageQuerySchema.parse(query));
  }
}
