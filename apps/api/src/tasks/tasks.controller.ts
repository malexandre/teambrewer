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
  createTaskSchema,
  type Task,
  type TaskListResponse,
  taskListQuerySchema,
  updateTaskSchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { TasksService } from "./tasks.service.js";

/**
 * Team-scoped task endpoints (docs/features/tasks.md). Every route is guarded by
 * {@link TeamContextGuard}; the verified team comes from `@CurrentTeam()`, never the
 * body. Bodies/queries are validated at the boundary with the shared Zod schemas.
 * Voting is upvote-only via `PUT/DELETE .../votes/me`, with the voter taken from the
 * verified context.
 */
@Controller("tasks")
@UseGuards(TeamContextGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@CurrentTeam() team: TeamContext, @Query() query: unknown): Promise<TaskListResponse> {
    return this.tasks.list(team, taskListQuerySchema.parse(query));
  }

  @Post()
  create(@CurrentTeam() team: TeamContext, @Body() body: unknown): Promise<Task> {
    return this.tasks.create(team, createTaskSchema.parse(body));
  }

  @Get(":taskId")
  getTask(@CurrentTeam() team: TeamContext, @Param("taskId") taskId: string): Promise<Task> {
    return this.tasks.getTask(team, taskId);
  }

  @Patch(":taskId")
  update(
    @CurrentTeam() team: TeamContext,
    @Param("taskId") taskId: string,
    @Body() body: unknown,
  ): Promise<Task> {
    return this.tasks.update(team, taskId, updateTaskSchema.parse(body));
  }

  @Delete(":taskId")
  @HttpCode(204)
  archive(@CurrentTeam() team: TeamContext, @Param("taskId") taskId: string): Promise<void> {
    return this.tasks.archive(team, taskId);
  }

  @Put(":taskId/votes/me")
  castVote(@CurrentTeam() team: TeamContext, @Param("taskId") taskId: string): Promise<Task> {
    return this.tasks.castVote(team, taskId);
  }

  @Delete(":taskId/votes/me")
  @HttpCode(204)
  retractVote(@CurrentTeam() team: TeamContext, @Param("taskId") taskId: string): Promise<void> {
    return this.tasks.retractVote(team, taskId);
  }
}
