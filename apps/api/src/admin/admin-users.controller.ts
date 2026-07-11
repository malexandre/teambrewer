import { Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from "@nestjs/common";

import {
  adminCreateUserSchema,
  type AdminCreateUserResponse,
  type GeneratedLink,
} from "@teambrewer/shared";

import { TeamAdminGuard } from "../common/team-admin.guard.js";
import { AdminUsersService } from "./admin-users.service.js";

/**
 * Team-scoped account management. Authorized by {@link TeamAdminGuard}
 * (instance-admin or the team's own team-admin) against the `:teamId` path.
 */
@Controller("admin/teams/:teamId/users")
@UseGuards(TeamAdminGuard)
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Post()
  createUser(
    @Param("teamId") teamId: string,
    @Body() body: unknown,
  ): Promise<AdminCreateUserResponse> {
    return this.adminUsers.createUser(teamId, adminCreateUserSchema.parse(body));
  }

  @Post(":userId/setup-link")
  setupLink(
    @Param("teamId") teamId: string,
    @Param("userId") userId: string,
  ): Promise<GeneratedLink> {
    return this.adminUsers.generateSetupLink(teamId, userId);
  }

  @Post(":userId/discord-claim-link")
  discordClaimLink(
    @Param("teamId") teamId: string,
    @Param("userId") userId: string,
  ): Promise<GeneratedLink> {
    return this.adminUsers.generateDiscordClaimLink(teamId, userId);
  }

  @Post(":userId/reset-link")
  resetLink(
    @Param("teamId") teamId: string,
    @Param("userId") userId: string,
  ): Promise<GeneratedLink> {
    return this.adminUsers.generateResetLink(teamId, userId);
  }

  @Post(":userId/reset-2fa")
  @HttpCode(204)
  resetTwoFactor(
    @Param("teamId") teamId: string,
    @Param("userId") userId: string,
  ): Promise<void> {
    return this.adminUsers.resetTwoFactor(teamId, userId);
  }

  @Delete(":userId/sessions")
  @HttpCode(204)
  revokeSessions(
    @Param("teamId") teamId: string,
    @Param("userId") userId: string,
  ): Promise<void> {
    return this.adminUsers.revokeSessions(teamId, userId);
  }
}
