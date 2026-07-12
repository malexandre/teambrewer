import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import {
  createRetrospectiveSchema,
  type Retrospective,
  updateRetrospectiveSchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { RetrospectivesService } from "./retrospectives.service.js";

/**
 * Team-scoped post-event retrospective endpoints, nested under the event
 * (docs/features/gameplans-and-deck-selection.md). Guarded by {@link TeamContextGuard};
 * the verified team + author come from `@CurrentTeam()`, never the body. One
 * retrospective per event; any member authors, the author or a team-admin edits.
 */
@Controller("events")
@UseGuards(TeamContextGuard)
export class RetrospectivesController {
  constructor(private readonly retrospectives: RetrospectivesService) {}

  @Get(":eventId/retrospective")
  getForEvent(@Param("eventId") eventId: string): Promise<Retrospective> {
    return this.retrospectives.getForEvent(eventId);
  }

  @Post(":eventId/retrospective")
  create(
    @CurrentTeam() team: TeamContext,
    @Param("eventId") eventId: string,
    @Body() body: unknown,
  ): Promise<Retrospective> {
    return this.retrospectives.create(team, eventId, createRetrospectiveSchema.parse(body));
  }

  @Patch(":eventId/retrospective/:retrospectiveId")
  update(
    @CurrentTeam() team: TeamContext,
    @Param("eventId") eventId: string,
    @Param("retrospectiveId") retrospectiveId: string,
    @Body() body: unknown,
  ): Promise<Retrospective> {
    return this.retrospectives.update(
      team,
      eventId,
      retrospectiveId,
      updateRetrospectiveSchema.parse(body),
    );
  }
}
