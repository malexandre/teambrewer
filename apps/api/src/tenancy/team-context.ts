import type { Request } from "express";

import type { TeamRole } from "../generated/prisma/enums.js";

/**
 * The verified tenancy context attached to every team-scoped request by
 * {@link TeamContextGuard}. It is derived server-side from the authenticated
 * session and a membership lookup — never from client-supplied values — and is
 * the single source of truth for `teamId` in team-owned queries and writes
 * (see docs/architecture/multi-tenancy.md).
 */
export interface TeamContext {
  userId: string;
  teamId: string;
  role: TeamRole;
  /**
   * The team's game (`Game.id` slug). Global reference reads (cards, formats,
   * heroes) are filtered by this — resolved server-side from the verified team,
   * never from a client-supplied value.
   */
  gameId: string;
}

/**
 * Express request augmented by the auth + tenancy layers. `userId` is set by
 * authentication (Better Auth); `teamContext` is set by {@link TeamContextGuard}
 * once membership is verified.
 */
export interface RequestWithTenantContext extends Request {
  userId?: string;
  /** Global instance-admin flag, attached by authentication alongside `userId`. */
  isInstanceAdmin?: boolean;
  teamContext?: TeamContext;
}

/** The header carrying the client's intended active team (finalized in phase-01). */
export const ACTIVE_TEAM_HEADER = "x-team-id";
