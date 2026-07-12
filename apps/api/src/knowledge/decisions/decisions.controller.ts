import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import {
  createDecisionSchema,
  type Decision,
  type DecisionListResponse,
  decisionListQuerySchema,
  updateDecisionSchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../../tenancy/current-team.decorator.js";
import type { TeamContext } from "../../tenancy/team-context.js";
import { TeamContextGuard } from "../../tenancy/team-context.guard.js";
import { DecisionsService } from "./decisions.service.js";

/**
 * Team-scoped decisions-log endpoints (docs/features/team-knowledge.md). Every route is
 * guarded by {@link TeamContextGuard}; the verified team comes from `@CurrentTeam()`,
 * never the body. There is no delete — the log is append-oriented. Bodies/queries are
 * validated at the boundary with the shared Zod schemas.
 */
@Controller("decisions")
@UseGuards(TeamContextGuard)
export class DecisionsController {
  constructor(private readonly decisions: DecisionsService) {}

  @Get()
  list(@Query() query: unknown): Promise<DecisionListResponse> {
    return this.decisions.list(decisionListQuerySchema.parse(query));
  }

  @Post()
  create(@CurrentTeam() team: TeamContext, @Body() body: unknown): Promise<Decision> {
    return this.decisions.create(team, createDecisionSchema.parse(body));
  }

  @Get(":decisionId")
  getDecision(@Param("decisionId") decisionId: string): Promise<Decision> {
    return this.decisions.getDecision(decisionId);
  }

  @Patch(":decisionId")
  update(
    @CurrentTeam() team: TeamContext,
    @Param("decisionId") decisionId: string,
    @Body() body: unknown,
  ): Promise<Decision> {
    return this.decisions.update(team, decisionId, updateDecisionSchema.parse(body));
  }
}
