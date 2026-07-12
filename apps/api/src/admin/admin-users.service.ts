import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import {
  type AdminCreateUserInput,
  type AdminCreateUserResponse,
  type AdminUserSummary,
  errorCode,
  type GeneratedLink,
} from "@teambrewer/shared";

import { AuthService } from "../auth/auth.service.js";
import { InviteTokenService } from "../auth/invite-token.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { buildOnboardingLink } from "./onboarding-link.js";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002"
  );
}

/**
 * Admin account management, scoped to a team by the guard-verified `:teamId`
 * path. Creates accounts + membership and issues the single-use onboarding /
 * recovery links (no email — ADR-0003). Every per-user action first asserts the
 * target is a member of the acting team, so a team-admin can never reach a user
 * in another team.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly inviteTokens: InviteTokenService,
  ) {}

  async createUser(teamId: string, input: AdminCreateUserInput): Promise<AdminCreateUserResponse> {
    let userId: string;
    try {
      ({ userId } = await this.authService.provisionAccount({
        username: input.username,
        displayName: input.displayName,
        authMethod: input.authMethod,
      }));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          error: {
            code: errorCode.conflict,
            message: "That username is already taken.",
          },
        });
      }
      throw error;
    }

    await this.prisma.teamMembership.create({
      data: { teamId, userId, role: input.role },
    });

    const purpose = input.authMethod === "discord" ? "discord_link" : "setup";
    const link = await this.issueLink(userId, teamId, purpose);
    const user = await this.loadSummary(userId);
    return { user, link };
  }

  async generateSetupLink(teamId: string, userId: string): Promise<GeneratedLink> {
    await this.assertTeamMember(teamId, userId);
    return this.issueLink(userId, teamId, "setup");
  }

  async generateDiscordClaimLink(teamId: string, userId: string): Promise<GeneratedLink> {
    await this.assertTeamMember(teamId, userId);
    return this.issueLink(userId, teamId, "discord_link");
  }

  async generateResetLink(teamId: string, userId: string): Promise<GeneratedLink> {
    const user = await this.assertTeamMember(teamId, userId);
    if (user.authMethod === "discord") {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.loginMethodMismatch,
          message: "This account signs in with Discord; a password reset does not apply.",
        },
      });
    }
    return this.issueLink(userId, teamId, "reset");
  }

  /** Clear TOTP + backup codes so the user re-enrolls (password accounts only). */
  async resetTwoFactor(teamId: string, userId: string): Promise<void> {
    const user = await this.assertTeamMember(teamId, userId);
    if (user.authMethod === "discord") {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.loginMethodMismatch,
          message: "This account signs in with Discord; it has no app-side 2FA to reset.",
        },
      });
    }
    await this.prisma.$transaction([
      this.prisma.twoFactor.deleteMany({ where: { userId } }),
      this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } }),
    ]);
  }

  async revokeSessions(teamId: string, userId: string): Promise<void> {
    await this.assertTeamMember(teamId, userId);
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  private async issueLink(
    userId: string,
    teamId: string,
    purpose: "setup" | "reset" | "discord_link",
  ): Promise<GeneratedLink> {
    const { rawToken, expiresAt } = await this.inviteTokens.issue({ userId, teamId, purpose });
    return buildOnboardingLink(purpose, rawToken, expiresAt);
  }

  private async assertTeamMember(teamId: string, userId: string): Promise<{ authMethod: string }> {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { user: { select: { authMethod: true } } },
    });
    if (!membership) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "That user is not a member of this team." },
      });
    }
    return membership.user;
  }

  private async loadSummary(userId: string): Promise<AdminUserSummary> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        authMethod: true,
        isInstanceAdmin: true,
        discordUsername: true,
      },
    });
    if (!user) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Account not found." },
      });
    }
    return {
      id: user.id,
      username: user.username ?? "",
      displayName: user.displayName,
      authMethod: user.authMethod === "discord" ? "discord" : "password_totp",
      isInstanceAdmin: user.isInstanceAdmin,
      discordUsername: user.discordUsername,
    };
  }
}
