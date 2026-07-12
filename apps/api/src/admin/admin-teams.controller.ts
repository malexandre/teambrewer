import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";

import { createTeamSchema, type TeamList, type TeamSummary } from "@teambrewer/shared";

import { CurrentUser, type CurrentUserContext } from "../common/current-user.decorator.js";
import { RequireInstanceAdmin } from "../common/roles.decorator.js";
import { RoleGuard } from "../common/role.guard.js";
import { AdminTeamsService } from "./admin-teams.service.js";

/** Instance-admin team administration (create / list / archive). */
@Controller("admin/teams")
@UseGuards(RoleGuard)
@RequireInstanceAdmin()
export class AdminTeamsController {
  constructor(private readonly adminTeams: AdminTeamsService) {}

  @Post()
  create(@CurrentUser() caller: CurrentUserContext, @Body() body: unknown): Promise<TeamSummary> {
    return this.adminTeams.createTeam(caller.userId, createTeamSchema.parse(body));
  }

  @Get()
  async list(): Promise<TeamList> {
    return { data: await this.adminTeams.listTeams() };
  }

  @Delete(":teamId")
  @HttpCode(204)
  archive(@Param("teamId") teamId: string): Promise<void> {
    return this.adminTeams.archiveTeam(teamId);
  }
}
