import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";

import {
  createPollSchema,
  type Poll,
  type PollListResponse,
  pollListQuerySchema,
  pollVoteSchema,
  updatePollSchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../../tenancy/current-team.decorator.js";
import type { TeamContext } from "../../tenancy/team-context.js";
import { TeamContextGuard } from "../../tenancy/team-context.guard.js";
import { PollsService } from "./polls.service.js";

/**
 * Team-scoped poll endpoints (docs/features/team-knowledge.md). Every route is guarded by
 * {@link TeamContextGuard}; the verified team comes from `@CurrentTeam()`, never the body.
 * Voting upserts the caller's single vote; the vote endpoints return the poll with its
 * refreshed tally. Bodies/queries are validated at the boundary with the shared schemas.
 */
@Controller("polls")
@UseGuards(TeamContextGuard)
export class PollsController {
  constructor(private readonly polls: PollsService) {}

  @Get()
  list(@CurrentTeam() team: TeamContext, @Query() query: unknown): Promise<PollListResponse> {
    return this.polls.list(team, pollListQuerySchema.parse(query));
  }

  @Post()
  create(@CurrentTeam() team: TeamContext, @Body() body: unknown): Promise<Poll> {
    return this.polls.create(team, createPollSchema.parse(body));
  }

  @Get(":pollId")
  getPoll(@CurrentTeam() team: TeamContext, @Param("pollId") pollId: string): Promise<Poll> {
    return this.polls.getPoll(team, pollId);
  }

  @Patch(":pollId")
  update(
    @CurrentTeam() team: TeamContext,
    @Param("pollId") pollId: string,
    @Body() body: unknown,
  ): Promise<Poll> {
    return this.polls.update(team, pollId, updatePollSchema.parse(body));
  }

  @Put(":pollId/vote")
  vote(
    @CurrentTeam() team: TeamContext,
    @Param("pollId") pollId: string,
    @Body() body: unknown,
  ): Promise<Poll> {
    return this.polls.vote(team, pollId, pollVoteSchema.parse(body));
  }

  @Delete(":pollId/vote")
  retractVote(@CurrentTeam() team: TeamContext, @Param("pollId") pollId: string): Promise<Poll> {
    return this.polls.retractVote(team, pollId);
  }
}
