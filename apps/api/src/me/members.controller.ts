import { Controller, Get, UseGuards } from "@nestjs/common";

import { type TeamMemberList } from "@teambrewer/shared";

import { MembershipService } from "../admin/membership.service.js";
import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";

/**
 * Member-facing roster of the **active team**. Unlike the admin membership
 * routes (path-scoped, TeamAdminGuard), this uses the `X-Team-Id` header +
 * {@link TeamContextGuard}: any member of the active team may list its members,
 * and the guard rejects a forged team id — exercising the tenant-isolation
 * backbone end-to-end.
 */
@Controller("members")
@UseGuards(TeamContextGuard)
export class MembersController {
  constructor(private readonly membership: MembershipService) {}

  @Get()
  async list(@CurrentTeam() team: TeamContext): Promise<TeamMemberList> {
    return { data: await this.membership.listMembers(team.teamId) };
  }
}
