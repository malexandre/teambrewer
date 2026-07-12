import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";

import { errorCode } from "@teambrewer/shared";

import { PrismaService } from "../prisma/prisma.service.js";
import { ACTIVE_TEAM_HEADER, type RequestWithTenantContext } from "./team-context.js";

/**
 * Verifies the active team against the caller's memberships on every request and
 * attaches a trusted `{ userId, teamId, role }` context. This is the core of
 * tenant isolation (docs/architecture/multi-tenancy.md): the client's
 * `X-Team-Id` header is only ever used to select which membership to load, never
 * trusted for scoping.
 *
 * - not authenticated              -> 401
 * - `X-Team-Id` header missing     -> 400
 * - no membership for that team    -> 403 (logged as a tenant-violation attempt)
 */
@Injectable()
export class TeamContextGuard implements CanActivate {
  private readonly logger = new Logger(TeamContextGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithTenantContext>();

    const userId = request.userId;
    if (!userId) {
      throw new UnauthorizedException({
        error: { code: errorCode.unauthenticated, message: "Authentication required." },
      });
    }

    const headerValue = request.headers[ACTIVE_TEAM_HEADER];
    const teamId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!teamId) {
      throw new BadRequestException({
        error: {
          code: errorCode.validationFailed,
          message: "The X-Team-Id header is required.",
        },
      });
    }

    const membership = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
      // The team's game comes along for free here, so game-filtered reference
      // reads (cards/formats/heroes) never need a second query or a client value.
      select: { role: true, team: { select: { gameId: true } } },
    });

    if (!membership) {
      // Opaque ids only; no PII. Recorded for audit per security.md.
      this.logger.warn(`Tenant access denied: user ${userId} is not a member of team ${teamId}`);
      throw new ForbiddenException({
        error: {
          code: errorCode.tenantForbidden,
          message: "You do not have access to this team.",
        },
      });
    }

    request.teamContext = { userId, teamId, role: membership.role, gameId: membership.team.gameId };
    return true;
  }
}
