import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import {
  type CreateMembershipInput,
  errorCode,
  type TeamMember,
  type TeamRole,
} from "@teambrewer/shared";

import { PrismaService } from "../prisma/prisma.service.js";

interface MembershipWithUser {
  role: string;
  joinedAt: Date;
  user: { id: string; username: string | null; displayName: string };
}

function toTeamMember(membership: MembershipWithUser): TeamMember {
  return {
    userId: membership.user.id,
    username: membership.user.username ?? "",
    displayName: membership.user.displayName,
    role: membership.role === "team_admin" ? "team_admin" : "member",
    joinedAt: membership.joinedAt.toISOString(),
  };
}

/**
 * Team membership management. `teamId` is always the guard-verified value from
 * the request path (never a body) and every query is scoped to it. Enforces the
 * last-team-admin rule (teams-and-membership.md): a team must always retain at
 * least one team-admin, so the last admin cannot be demoted or removed.
 */
@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async listMembers(teamId: string): Promise<TeamMember[]> {
    const memberships = await this.prisma.teamMembership.findMany({
      where: { teamId },
      orderBy: { joinedAt: "asc" },
      select: {
        role: true,
        joinedAt: true,
        user: { select: { id: true, username: true, displayName: true } },
      },
    });
    return memberships.map(toTeamMember);
  }

  async addMember(teamId: string, input: CreateMembershipInput): Promise<TeamMember> {
    const user = await this.resolveUser(input);
    if (!user) {
      throw new UnprocessableEntityException({
        error: { code: errorCode.domainRuleViolation, message: "That user does not exist." },
      });
    }

    const existing = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId: user.id } },
      select: { teamId: true },
    });
    if (existing) {
      throw new ConflictException({
        error: {
          code: errorCode.conflict,
          message: "That user is already a member of this team.",
        },
      });
    }

    await this.prisma.teamMembership.create({
      data: { teamId, userId: user.id, role: input.role },
    });
    return this.requireMember(teamId, user.id);
  }

  /** Resolve the target user from exactly one of userId / username (schema-enforced). */
  private async resolveUser(input: CreateMembershipInput): Promise<{ id: string } | null> {
    if (input.userId) {
      return this.prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
    }
    if (input.username) {
      return this.prisma.user.findUnique({
        where: { username: input.username },
        select: { id: true },
      });
    }
    return null;
  }

  async changeRole(teamId: string, userId: string, role: TeamRole): Promise<TeamMember> {
    const membership = await this.requireMembershipRow(teamId, userId);
    if (membership.role === "team_admin" && role !== "team_admin") {
      await this.assertNotLastAdmin(teamId);
    }
    await this.prisma.teamMembership.update({
      where: { teamId_userId: { teamId, userId } },
      data: { role },
    });
    return this.requireMember(teamId, userId);
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    const membership = await this.requireMembershipRow(teamId, userId);
    if (membership.role === "team_admin") {
      await this.assertNotLastAdmin(teamId);
    }
    await this.prisma.teamMembership.delete({ where: { teamId_userId: { teamId, userId } } });
  }

  private async requireMembershipRow(teamId: string, userId: string): Promise<{ role: string }> {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { role: true },
    });
    if (!membership) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "That user is not a member of this team." },
      });
    }
    return membership;
  }

  private async requireMember(teamId: string, userId: string): Promise<TeamMember> {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: {
        role: true,
        joinedAt: true,
        user: { select: { id: true, username: true, displayName: true } },
      },
    });
    if (!membership) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "That user is not a member of this team." },
      });
    }
    return toTeamMember(membership);
  }

  private async assertNotLastAdmin(teamId: string): Promise<void> {
    const adminCount = await this.prisma.teamMembership.count({
      where: { teamId, role: "team_admin" },
    });
    if (adminCount <= 1) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.lastTeamAdmin,
          message: "A team must keep at least one team admin; appoint another first.",
        },
      });
    }
  }
}
