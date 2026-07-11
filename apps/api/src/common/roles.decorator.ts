import { SetMetadata } from "@nestjs/common";

import type { TeamRole } from "../generated/prisma/enums.js";

export const REQUIRE_INSTANCE_ADMIN_KEY = "requireInstanceAdmin";
export const REQUIRED_TEAM_ROLES_KEY = "requiredTeamRoles";

/**
 * Restrict a route to instance-admins (global). Instance-admins also satisfy any
 * team-role requirement, being global superusers (see multi-tenancy.md).
 */
export const RequireInstanceAdmin = (): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_INSTANCE_ADMIN_KEY, true);

/**
 * Restrict a route to the given per-team role(s). Requires the TeamContextGuard
 * to have established the team context. `RequireTeamRole("team_admin")` allows
 * team-admins (and instance-admins); omit for member-level access.
 */
export const RequireTeamRole = (...roles: TeamRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_TEAM_ROLES_KEY, roles);
