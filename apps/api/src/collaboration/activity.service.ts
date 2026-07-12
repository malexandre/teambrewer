import { Injectable } from "@nestjs/common";

import {
  type ActivityEvent,
  type ActivityListResponse,
  type ActivityQuery,
  type ActivityVerb,
} from "@teambrewer/shared";

import { decodeKeysetCursor, encodeKeysetCursor } from "../common/keyset-cursor.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";
import { SubjectResolverRegistry } from "./subject-resolver.js";

/** A recorded action for the team activity feed. */
export interface RecordActivityInput {
  verb: ActivityVerb;
  subjectType: string;
  subjectId: string;
}

/** The persisted activity row (with its actor) this service maps to the contract. */
interface ActivityRow {
  id: string;
  verb: string;
  subjectType: string;
  subjectId: string;
  createdAt: Date;
  actor: { id: string; username: string | null; displayName: string };
}

/**
 * The team activity feed: an append-only, team-scoped, polymorphic timeline
 * (docs/features/collaboration-core.md). Modules call {@link recordActivity} as
 * meaningful things happen; the feed is read per-subject or team-wide. Every write
 * and read goes through {@link TeamScopedPrisma}, so it is filtered by the
 * verified `teamId` by construction.
 */
@Injectable()
export class CollaborationActivityService {
  constructor(
    private readonly scoped: TeamScopedPrisma,
    private readonly registry: SubjectResolverRegistry,
  ) {}

  /** Append an activity event for the acting member's team (teamId stamped from context). */
  async recordActivity(team: TeamContext, input: RecordActivityInput): Promise<void> {
    await this.scoped.db.activityEvent.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps the same
        // value; the explicit field satisfies Prisma's create typing).
        teamId: team.teamId,
        actorId: team.userId,
        verb: input.verb,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
      },
    });
  }

  /**
   * The activity feed, newest-first, keyset-paginated. With no filter it returns
   * the whole team feed; a `subjectId` narrows it to one subject and requires the
   * caller to be able to see that subject (→ 404 otherwise, so a private subject
   * never leaks through the feed).
   */
  async list(team: TeamContext, query: ActivityQuery): Promise<ActivityListResponse> {
    if (query.subjectId) {
      await this.registry.requireSubject(team, query.subjectType ?? "", query.subjectId);
    }

    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;
    const rows = (await this.scoped.db.activityEvent.findMany({
      where: {
        ...(query.subjectType ? { subjectType: query.subjectType } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.sortValue } },
                { createdAt: cursor.sortValue, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: {
        actor: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    })) as ActivityRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map(toActivityEvent),
      nextCursor: hasMore && last ? encodeKeysetCursor(last.createdAt, last.id) : null,
    };
  }
}

function toActivityEvent(row: ActivityRow): ActivityEvent {
  return {
    id: row.id,
    verb: row.verb as ActivityVerb,
    subjectType: row.subjectType as ActivityEvent["subjectType"],
    subjectId: row.subjectId,
    actor: {
      userId: row.actor.id,
      username: row.actor.username ?? "",
      displayName: row.actor.displayName,
    },
    createdAt: row.createdAt.toISOString(),
  };
}
