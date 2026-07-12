import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { type ActivityListResponse, activityQuerySchema } from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { CollaborationActivityService } from "./activity.service.js";

/**
 * The team activity feed (docs/features/collaboration-core.md). Guarded by
 * {@link TeamContextGuard}; returns the verified team's feed only. A per-subject
 * filter requires the caller to be able to see that subject (→ 404 otherwise).
 */
@Controller("activity")
@UseGuards(TeamContextGuard)
export class ActivityController {
  constructor(private readonly activity: CollaborationActivityService) {}

  @Get()
  list(@CurrentTeam() team: TeamContext, @Query() query: unknown): Promise<ActivityListResponse> {
    return this.activity.list(team, activityQuerySchema.parse(query));
  }
}
