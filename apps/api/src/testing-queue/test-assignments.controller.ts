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
  createTestAssignmentSchema,
  type TestAssignment,
  type TestAssignmentListResponse,
  testAssignmentListQuerySchema,
  updateTestAssignmentSchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { TestAssignmentsService } from "./test-assignments.service.js";

/**
 * Team-scoped test-assignment endpoints (docs/features/testing-queue.md). Every route
 * is guarded by {@link TeamContextGuard}; the verified team comes from
 * `@CurrentTeam()`, never the body. Bodies/queries are validated at the boundary with
 * the shared Zod schemas. The opponent snapshot is resolved server-side.
 */
@Controller("test-assignments")
@UseGuards(TeamContextGuard)
export class TestAssignmentsController {
  constructor(private readonly assignments: TestAssignmentsService) {}

  @Get()
  list(@Query() query: unknown): Promise<TestAssignmentListResponse> {
    return this.assignments.list(testAssignmentListQuerySchema.parse(query));
  }

  @Post()
  create(@CurrentTeam() team: TeamContext, @Body() body: unknown): Promise<TestAssignment> {
    return this.assignments.create(team, createTestAssignmentSchema.parse(body));
  }

  @Patch(":assignmentId")
  update(
    @CurrentTeam() team: TeamContext,
    @Param("assignmentId") assignmentId: string,
    @Body() body: unknown,
  ): Promise<TestAssignment> {
    return this.assignments.update(team, assignmentId, updateTestAssignmentSchema.parse(body));
  }

  @Delete(":assignmentId")
  @HttpCode(204)
  archive(
    @CurrentTeam() team: TeamContext,
    @Param("assignmentId") assignmentId: string,
  ): Promise<void> {
    return this.assignments.archive(team, assignmentId);
  }
}
