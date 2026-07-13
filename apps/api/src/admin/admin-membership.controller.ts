import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import {
  type CandidateUserList,
  createMembershipSchema,
  type TeamMember,
  type TeamMemberList,
  updateMembershipSchema,
} from "@teambrewer/shared";

import { TeamAdminGuard } from "../common/team-admin.guard.js";
import { MembershipService } from "./membership.service.js";

/**
 * Team membership management (admin console). Authorized by {@link TeamAdminGuard}
 * against the `:teamId` path. The member-facing roster lives at the header-scoped
 * `GET /api/members` (member module); this is the admin view + mutations.
 */
@Controller("admin/teams/:teamId/members")
@UseGuards(TeamAdminGuard)
export class AdminMembershipController {
  constructor(private readonly membership: MembershipService) {}

  @Get()
  async list(@Param("teamId") teamId: string): Promise<TeamMemberList> {
    return { data: await this.membership.listMembers(teamId) };
  }

  /** Accounts not yet in this team — the choices for adding an existing member. */
  @Get("candidate-users")
  async listCandidateUsers(@Param("teamId") teamId: string): Promise<CandidateUserList> {
    return { data: await this.membership.listCandidateUsers(teamId) };
  }

  @Post()
  add(@Param("teamId") teamId: string, @Body() body: unknown): Promise<TeamMember> {
    return this.membership.addMember(teamId, createMembershipSchema.parse(body));
  }

  @Patch(":userId")
  changeRole(
    @Param("teamId") teamId: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ): Promise<TeamMember> {
    const { role } = updateMembershipSchema.parse(body);
    return this.membership.changeRole(teamId, userId, role);
  }

  @Delete(":userId")
  @HttpCode(204)
  remove(@Param("teamId") teamId: string, @Param("userId") userId: string): Promise<void> {
    return this.membership.removeMember(teamId, userId);
  }
}
