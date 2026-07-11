import { Inject, Injectable, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";

import { PrismaService } from "../prisma/prisma.service.js";
import type { RequestWithTenantContext } from "./team-context.js";

/**
 * Prisma models that carry a `teamId` and must always be scoped to the active
 * team. Global tables (User, Session, Game, …) are intentionally absent. As
 * feature phases add team-owned models (decks, game logs, events, …), add their
 * delegate names here so they are scoped by construction.
 */
export const TEAM_OWNED_MODELS = new Set<string>(["teamMembership"]);

/** Read/aggregate methods whose `where` must include the active `teamId`. */
const WHERE_SCOPED_METHODS = new Set<string>([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

type UnknownArgs = Record<string, unknown>;

function mergeTeamId(value: unknown, teamId: string): UnknownArgs {
  const object = (value ?? {}) as UnknownArgs;
  // Spread `teamId` last so a client-supplied value can never override the
  // verified context — it is stamped, not trusted (multi-tenancy.md).
  return { ...object, teamId };
}

function wrapDelegate(delegate: object, teamId: string): object {
  return new Proxy(delegate, {
    get(target, property, receiver) {
      const original = Reflect.get(target, property, receiver);
      if (typeof original !== "function" || typeof property !== "string") {
        return original;
      }
      const method = original as (args?: UnknownArgs) => unknown;

      if (WHERE_SCOPED_METHODS.has(property)) {
        return (args: UnknownArgs = {}) =>
          method.call(target, { ...args, where: mergeTeamId(args.where, teamId) });
      }
      if (property === "create") {
        return (args: UnknownArgs = {}) =>
          method.call(target, { ...args, data: mergeTeamId(args.data, teamId) });
      }
      if (property === "createMany") {
        return (args: UnknownArgs = {}) => {
          const data = Array.isArray(args.data)
            ? args.data.map((row) => mergeTeamId(row, teamId))
            : mergeTeamId(args.data, teamId);
          return method.call(target, { ...args, data });
        };
      }
      return method.bind(target);
    },
  });
}

/**
 * Wrap a PrismaService so that every operation on a team-owned model is
 * automatically filtered by (reads) and stamped with (writes) the given
 * `teamId`. Operations on global models pass through untouched. Singular
 * by-unique-key operations (`findUnique`/`update`/`delete`) are intentionally
 * NOT scoped — feature code uses `findFirst`/`updateMany`/`deleteMany` through
 * this client so the team filter always applies.
 */
export function createTeamScopedClient(prisma: PrismaService, teamId: string): PrismaService {
  return new Proxy(prisma, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property === "string" && TEAM_OWNED_MODELS.has(property)) {
        return wrapDelegate(value as object, teamId);
      }
      return typeof value === "function" ? (value as () => unknown).bind(target) : value;
    },
  }) as PrismaService;
}

/**
 * Request-scoped, mandatory data-access helper for team-owned data. Feature
 * services inject this instead of the raw `PrismaService`, so they cannot forget
 * to scope by `teamId`. It reads the verified team from the request context set
 * by {@link TeamContextGuard}.
 */
@Injectable({ scope: Scope.REQUEST })
export class TeamScopedPrisma {
  private readonly client: PrismaService;

  constructor(prisma: PrismaService, @Inject(REQUEST) request: RequestWithTenantContext) {
    const teamContext = request.teamContext;
    if (!teamContext) {
      throw new Error("TeamScopedPrisma requires TeamContextGuard to have set the team context.");
    }
    this.client = createTeamScopedClient(prisma, teamContext.teamId);
  }

  /** The team-scoped Prisma client. Every team-owned query it runs is filtered by teamId. */
  get db(): PrismaService {
    return this.client;
  }
}
