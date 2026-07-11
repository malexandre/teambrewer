import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

import { errorCode } from "@teambrewer/shared";

import { PrismaService } from "../prisma/prisma.service.js";
import type { RequestWithTenantContext } from "../tenancy/team-context.js";

/**
 * Authorization for team-management routes that carry the target team in the
 * path (`/api/admin/teams/:teamId/...`, `/api/teams/:teamId/...`). This is the
 * "management" counterpart to the member-facing {@link TeamContextGuard}:
 *
 * - An **instance-admin** may manage **any** team (global), so long as it exists
 *   (404 otherwise). Management access does NOT grant data access — reading a
 *   team's competitive data still goes through the header-based TeamContextGuard,
 *   which requires a real membership (see docs/architecture/multi-tenancy.md,
 *   phase-01 admin-tenancy decision "Option C").
 * - A **team-admin** may manage only their **own** team.
 * - Everyone else is denied.
 *
 * The tenant-isolation backbone (TeamContextGuard) intentionally has no
 * instance-admin bypass; this guard keeps that separation explicit.
 */
@Injectable()
export class TeamAdminGuard implements CanActivate {
  private readonly logger = new Logger(TeamAdminGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithTenantContext>();

    const userId = request.userId;
    if (!userId) {
      throw new UnauthorizedException({
        error: { code: errorCode.unauthenticated, message: "Authentication required." },
      });
    }

    const rawTeamId = request.params?.teamId;
    const teamId = Array.isArray(rawTeamId) ? rawTeamId[0] : rawTeamId;
    if (!teamId) {
      // Programmer error: this guard must only be used on a `:teamId` route.
      throw new InternalServerErrorException({
        error: {
          code: errorCode.internal,
          message: "TeamAdminGuard requires a :teamId route parameter.",
        },
      });
    }

    if (request.isInstanceAdmin) {
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true },
      });
      if (!team) {
        throw new NotFoundException({
          error: { code: errorCode.notFound, message: "Team not found." },
        });
      }
      return true;
    }

    const membership = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { role: true },
    });

    if (!membership) {
      // Opaque ids only; no PII. Recorded for audit per security.md. A non-member
      // (incl. a team-admin of another team) is denied without disclosing whether
      // the team exists.
      this.logger.warn(`Admin access denied: user ${userId} is not a member of team ${teamId}`);
      throw new ForbiddenException({
        error: {
          code: errorCode.tenantForbidden,
          message: "You do not have access to this team.",
        },
      });
    }

    if (membership.role !== "team_admin") {
      throw new ForbiddenException({
        error: {
          code: errorCode.forbidden,
          message: "This action requires a team administrator.",
        },
      });
    }

    return true;
  }
}
