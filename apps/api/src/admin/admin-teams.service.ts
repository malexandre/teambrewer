import { randomBytes } from "node:crypto";

import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";

import {
  type AdminUserSummary,
  type CreateTeamInput,
  errorCode,
  type TeamSummary,
} from "@teambrewer/shared";

import { PrismaService } from "../prisma/prisma.service.js";

interface TeamRow {
  id: string;
  name: string;
  slug: string;
  gameId: string;
  createdBy: string;
  createdAt: Date;
  archivedAt: Date | null;
}

function toTeamSummary(team: TeamRow): TeamSummary {
  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    gameId: team.gameId,
    createdBy: team.createdBy,
    createdAt: team.createdAt.toISOString(),
    archivedAt: team.archivedAt ? team.archivedAt.toISOString() : null,
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Instance-admin team administration: create teams (game fixed for the team's
 * life), list them, archive them, and set/clear the global instance-admin flag.
 */
@Injectable()
export class AdminTeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTeam(creatorUserId: string, input: CreateTeamInput): Promise<TeamSummary> {
    const team = await this.prisma.$transaction(async (transaction) => {
      const slug = await this.uniqueSlug(transaction, input.name);
      const created = await transaction.team.create({
        data: { name: input.name, slug, gameId: input.gameId, createdBy: creatorUserId },
      });

      if (input.firstAdminUserId) {
        const user = await transaction.user.findUnique({
          where: { id: input.firstAdminUserId },
          select: { id: true },
        });
        if (!user) {
          throw new UnprocessableEntityException({
            error: {
              code: errorCode.domainRuleViolation,
              message: "The nominated first team admin does not exist.",
            },
          });
        }
        await transaction.teamMembership.create({
          data: { teamId: created.id, userId: input.firstAdminUserId, role: "team_admin" },
        });
      }
      return created;
    });
    return toTeamSummary(team);
  }

  async listTeams(): Promise<TeamSummary[]> {
    const teams = await this.prisma.team.findMany({ orderBy: { createdAt: "asc" } });
    return teams.map(toTeamSummary);
  }

  /** Soft-archive: preserves the team's data while ending its active use. */
  async archiveTeam(teamId: string): Promise<void> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!team) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Team not found." },
      });
    }
    await this.prisma.team.update({ where: { id: teamId }, data: { archivedAt: new Date() } });
  }

  async setInstanceAdmin(userId: string, isInstanceAdmin: boolean): Promise<AdminUserSummary> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Account not found." },
      });
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isInstanceAdmin },
      select: {
        id: true,
        username: true,
        displayName: true,
        authMethod: true,
        isInstanceAdmin: true,
        discordUsername: true,
      },
    });
    return {
      id: updated.id,
      username: updated.username ?? "",
      displayName: updated.displayName,
      authMethod: updated.authMethod === "discord" ? "discord" : "password_totp",
      isInstanceAdmin: updated.isInstanceAdmin,
      discordUsername: updated.discordUsername,
    };
  }

  private async uniqueSlug(
    transaction: Pick<PrismaService, "team">,
    name: string,
  ): Promise<string> {
    const base = slugify(name) || "team";
    const existing = await transaction.team.findUnique({
      where: { slug: base },
      select: { id: true },
    });
    if (!existing) {
      return base;
    }
    // Collision: append short entropy. base64url is avoided so the slug stays
    // URL- and DNS-friendly.
    return `${base}-${randomBytes(3).toString("hex")}`;
  }
}
