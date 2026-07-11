import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { errorCode } from "@teambrewer/shared";

import type { TeamRole } from "../generated/prisma/enums.js";
import type { RequestWithTenantContext } from "../tenancy/team-context.js";
import { REQUIRED_TEAM_ROLES_KEY, REQUIRE_INSTANCE_ADMIN_KEY } from "./roles.decorator.js";

/**
 * Default-deny authorization: enforces the @RequireInstanceAdmin() and
 * @RequireTeamRole() decorators. An authenticated request is required; the
 * global instance-admin satisfies any requirement. Team-role checks read the
 * verified role from the team context (so TeamContextGuard must run first).
 */
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()] as const;
    const requireInstanceAdmin =
      this.reflector.getAllAndOverride<boolean>(REQUIRE_INSTANCE_ADMIN_KEY, [...targets]) ?? false;
    const requiredTeamRoles =
      this.reflector.getAllAndOverride<TeamRole[]>(REQUIRED_TEAM_ROLES_KEY, [...targets]) ?? [];

    const request = context.switchToHttp().getRequest<RequestWithTenantContext>();

    if (!request.userId) {
      throw new UnauthorizedException({
        error: { code: errorCode.unauthenticated, message: "Authentication required." },
      });
    }

    // Instance-admins are global superusers and satisfy every requirement.
    if (request.isInstanceAdmin) {
      return true;
    }

    if (requireInstanceAdmin) {
      throw new ForbiddenException({
        error: {
          code: errorCode.forbidden,
          message: "This action requires an instance administrator.",
        },
      });
    }

    if (requiredTeamRoles.length > 0) {
      const role = request.teamContext?.role;
      if (!role || !requiredTeamRoles.includes(role)) {
        throw new ForbiddenException({
          error: {
            code: errorCode.forbidden,
            message: "You do not have permission to perform this action.",
          },
        });
      }
    }

    return true;
  }
}
