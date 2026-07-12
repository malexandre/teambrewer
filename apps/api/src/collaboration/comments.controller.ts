import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import {
  type Comment,
  type CommentThreadResponse,
  commentThreadQuerySchema,
  createCommentSchema,
  updateCommentSchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { CollaborationService } from "./collaboration.service.js";

/**
 * Polymorphic comment endpoints (docs/features/collaboration-core.md). Every route
 * is guarded by {@link TeamContextGuard}; the verified team comes from
 * `@CurrentTeam()`, never the body. Bodies/queries are validated at the boundary
 * with the shared Zod schemas. A subject the caller cannot see, or a comment in
 * another team, is a 404 (no enumeration).
 */
@Controller("comments")
@UseGuards(TeamContextGuard)
export class CommentsController {
  constructor(private readonly collaboration: CollaborationService) {}

  @Get()
  listThread(
    @CurrentTeam() team: TeamContext,
    @Query() query: unknown,
  ): Promise<CommentThreadResponse> {
    return this.collaboration.listThread(team, commentThreadQuerySchema.parse(query));
  }

  @Post()
  create(@CurrentTeam() team: TeamContext, @Body() body: unknown): Promise<Comment> {
    return this.collaboration.create(team, createCommentSchema.parse(body));
  }

  @Patch(":commentId")
  update(
    @CurrentTeam() team: TeamContext,
    @Param("commentId") commentId: string,
    @Body() body: unknown,
  ): Promise<Comment> {
    return this.collaboration.update(team, commentId, updateCommentSchema.parse(body));
  }

  @Delete(":commentId")
  @HttpCode(204)
  archive(@CurrentTeam() team: TeamContext, @Param("commentId") commentId: string): Promise<void> {
    return this.collaboration.archive(team, commentId);
  }
}
