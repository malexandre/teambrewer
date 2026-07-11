import { Injectable, NotFoundException } from "@nestjs/common";

import {
  type CurrentUser,
  errorCode,
  type SessionSummary,
  type TeamMembershipSummary,
} from "@teambrewer/shared";

import { PrismaService } from "../prisma/prisma.service.js";

/** Self-service reads/writes for the authenticated account. */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentUser(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        isInstanceAdmin: true,
        authMethod: true,
        twoFactorEnabled: true,
        discordUserId: true,
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
      isInstanceAdmin: user.isInstanceAdmin,
      authMethod: user.authMethod === "discord" ? "discord" : "password_totp",
      totpEnabled: user.twoFactorEnabled ?? false,
      discordUserId: user.discordUserId,
      discordUsername: user.discordUsername,
    };
  }

  /** Only the teams the caller belongs to — drives the active-team selector. */
  async getMyTeams(userId: string): Promise<TeamMembershipSummary[]> {
    const memberships = await this.prisma.teamMembership.findMany({
      where: { userId },
      orderBy: { joinedAt: "asc" },
      select: {
        role: true,
        team: { select: { id: true, name: true, slug: true, gameId: true } },
      },
    });
    return memberships.map((membership) => ({
      teamId: membership.team.id,
      name: membership.team.name,
      slug: membership.team.slug,
      gameId: membership.team.gameId,
      role: membership.role === "team_admin" ? "team_admin" : "member",
    }));
  }

  async getSessions(userId: string, currentSessionId: string | null): Promise<SessionSummary[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
      },
    });
    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      userAgent: session.userAgent ?? null,
      ipAddress: session.ipAddress ?? null,
      isCurrent: session.id === currentSessionId,
    }));
  }

  /** Sign out one of the caller's own sessions. Scoped to `userId` so a session id cannot be guessed across users. */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const deleted = await this.prisma.session.deleteMany({ where: { id: sessionId, userId } });
    if (deleted.count === 0) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Session not found." },
      });
    }
  }
}
