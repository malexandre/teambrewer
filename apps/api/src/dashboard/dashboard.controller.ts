import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import {
  type DashboardMeResponse,
  type DashboardTeamResponse,
  dashboardTeamQuerySchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { DashboardService } from "./dashboard.service.js";

/**
 * Read-only dashboard endpoints (docs/features/dashboard.md). Every route is guarded
 * by {@link TeamContextGuard}; the verified team comes from `@CurrentTeam()`, never a
 * client value. `/me` scopes additionally to the caller (`team.userId`); `/team`
 * aggregates the active team. Both compose the source modules' team-scoped reads.
 */
@Controller("dashboard")
@UseGuards(TeamContextGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("me")
  me(@CurrentTeam() team: TeamContext): Promise<DashboardMeResponse> {
    return this.dashboard.me(team);
  }

  @Get("team")
  team(@CurrentTeam() team: TeamContext, @Query() query: unknown): Promise<DashboardTeamResponse> {
    return this.dashboard.team(team, dashboardTeamQuerySchema.parse(query));
  }
}
