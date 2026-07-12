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
  createPrimerSchema,
  type PrimerDetail,
  type PrimerListResponse,
  primerListQuerySchema,
  updatePrimerSchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../../tenancy/current-team.decorator.js";
import type { TeamContext } from "../../tenancy/team-context.js";
import { TeamContextGuard } from "../../tenancy/team-context.guard.js";
import { PrimersService } from "./primers.service.js";

/**
 * Team-scoped primer endpoints (docs/features/team-knowledge.md). Every route is guarded
 * by {@link TeamContextGuard}; the verified team comes from `@CurrentTeam()`, never the
 * body. Bodies/queries are validated at the boundary with the shared Zod schemas.
 */
@Controller("primers")
@UseGuards(TeamContextGuard)
export class PrimersController {
  constructor(private readonly primers: PrimersService) {}

  @Get()
  list(@CurrentTeam() team: TeamContext, @Query() query: unknown): Promise<PrimerListResponse> {
    return this.primers.list(team, primerListQuerySchema.parse(query));
  }

  @Post()
  create(@CurrentTeam() team: TeamContext, @Body() body: unknown): Promise<PrimerDetail> {
    return this.primers.create(team, createPrimerSchema.parse(body));
  }

  @Get(":primerId")
  getPrimer(
    @CurrentTeam() team: TeamContext,
    @Param("primerId") primerId: string,
  ): Promise<PrimerDetail> {
    return this.primers.getPrimer(team, primerId);
  }

  @Patch(":primerId")
  update(
    @CurrentTeam() team: TeamContext,
    @Param("primerId") primerId: string,
    @Body() body: unknown,
  ): Promise<PrimerDetail> {
    return this.primers.update(team, primerId, updatePrimerSchema.parse(body));
  }

  @Delete(":primerId")
  @HttpCode(204)
  archive(@CurrentTeam() team: TeamContext, @Param("primerId") primerId: string): Promise<void> {
    return this.primers.archive(team, primerId);
  }
}
