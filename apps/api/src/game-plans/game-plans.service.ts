import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import {
  type CreateMatchupGamePlanInput,
  errorCode,
  type MatchupGamePlan,
  type MatchupGamePlanListQuery,
  type MatchupGamePlanListResponse,
  type UpdateMatchupGamePlanInput,
} from "@teambrewer/shared";

import { CollaborationActivityService } from "../collaboration/activity.service.js";
import { decodeKeysetCursor, encodeKeysetCursor } from "../common/keyset-cursor.js";
import { assertFormatInGame } from "../common/reference-data-guards.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";

/** A teammate's display identity, resolved for the game-plan card. */
interface UserRow {
  id: string;
  username: string | null;
  displayName: string;
}

/** The persisted game-plan shape (with its relations) this service maps to the contract. */
interface GamePlanRow {
  id: string;
  teamId: string;
  ourDeckId: string;
  formatId: string;
  name: string;
  body: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  ourDeck: { name: string };
  updatedBy: UserRow;
  metaDeckEntries: { metaDeckEntryId: string }[];
}

const GAME_PLAN_INCLUDE = {
  ourDeck: { select: { name: true } },
  updatedBy: { select: { id: true, username: true, displayName: true } },
  metaDeckEntries: { select: { metaDeckEntryId: true } },
} as const;

/**
 * Team-scoped matchup game-plans (docs/features/gameplans-and-deck-selection.md) — a
 * written, living guide for a matchup: a free-text `name`, the meta decks it covers,
 * and a body. Every query goes through {@link TeamScopedPrisma} so it is filtered by the
 * verified `teamId`; a cross-tenant id yields no row (→ 404, never leaking existence).
 * Game-plans are shared team knowledge (no owner): any member may create or edit (name,
 * body, and covered meta decks are all editable) while `updatedBy` is stamped; only a
 * team-admin may archive. Names are free-form — duplicates are allowed.
 */
@Injectable()
export class GamePlansService {
  constructor(
    private readonly scoped: TeamScopedPrisma,
    private readonly activity: CollaborationActivityService,
  ) {}

  /**
   * List the team's plans with `ourDeckId`/`formatId` filters + keyset pagination
   * (newest first). Archived plans are excluded.
   */
  async list(query: MatchupGamePlanListQuery): Promise<MatchupGamePlanListResponse> {
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;

    const andClauses: Record<string, unknown>[] = [];
    if (query.ourDeckId) andClauses.push({ ourDeckId: query.ourDeckId });
    if (query.formatId) andClauses.push({ formatId: query.formatId });
    if (cursor) {
      andClauses.push({
        OR: [
          { createdAt: { lt: cursor.sortValue } },
          { createdAt: cursor.sortValue, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = (await this.scoped.db.matchupGamePlan.findMany({
      where: { archivedAt: null, ...(andClauses.length > 0 ? { AND: andClauses } : {}) },
      include: GAME_PLAN_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    })) as GamePlanRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map(toMatchupGamePlan),
      nextCursor: hasMore && last ? encodeKeysetCursor(last.createdAt, last.id) : null,
    };
  }

  /** Read a single non-archived plan (team-scoped), mapped to the contract, or 404. */
  async getGamePlan(gamePlanId: string): Promise<MatchupGamePlan> {
    return toMatchupGamePlan(await this.requireActiveGamePlanRow(gamePlanId));
  }

  /**
   * Create a game-plan. Validates our deck + format belong to the team's game, then
   * stores the free-text `name`, the body, and the covered meta decks. Names are
   * free-form (no uniqueness). Stamps `updatedById` from the verified context. Key cards
   * live inline in the body as `+[[cardId]]` tokens (no structured child table).
   */
  async create(team: TeamContext, input: CreateMatchupGamePlanInput): Promise<MatchupGamePlan> {
    await this.assertTeamDeck(input.ourDeckId);
    await assertFormatInGame(this.scoped.db, team.gameId, input.formatId);
    const entryIds = await this.assertTeamMetaDeckEntries(input.metaDeckEntryIds ?? []);

    const created = await this.scoped.db.matchupGamePlan.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps teamId);
        // never from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        updatedById: team.userId,
        ourDeckId: input.ourDeckId,
        formatId: input.formatId,
        name: input.name,
        body: input.body,
      },
      select: { id: true },
    });
    await this.replaceAttachedEntries(created.id, entryIds);

    await this.recordActivity(team, created.id, "matchup_game_plan_created");
    return this.getGamePlan(created.id);
  }

  /**
   * Edit a game-plan in place (any team member). Any of `name`, `body`, or the covered
   * meta decks (`metaDeckEntryIds`, a replacement set) can change; `updatedBy` is
   * re-stamped. `ourDeckId`/`formatId` are fixed at creation.
   */
  async update(
    team: TeamContext,
    gamePlanId: string,
    input: UpdateMatchupGamePlanInput,
  ): Promise<MatchupGamePlan> {
    await this.requireActiveGamePlanRow(gamePlanId);

    // Validate any provided attachment set (same-team) BEFORE writing, so a bad id
    // rejects without committing a partial change.
    const entryIds =
      input.metaDeckEntryIds !== undefined
        ? await this.assertTeamMetaDeckEntries(input.metaDeckEntryIds)
        : null;

    const data: Record<string, unknown> = { updatedById: team.userId };
    if (input.name !== undefined) data["name"] = input.name;
    if (input.body !== undefined) data["body"] = input.body;
    await this.scoped.db.matchupGamePlan.updateMany({ where: { id: gamePlanId }, data });
    if (entryIds !== null) {
      await this.replaceAttachedEntries(gamePlanId, entryIds);
    }

    await this.recordActivity(team, gamePlanId, "matchup_game_plan_updated");
    return this.getGamePlan(gamePlanId);
  }

  /** Soft-delete (archive) a plan; team-admin only. Retained for history, dropped from lists. */
  async archive(team: TeamContext, gamePlanId: string): Promise<void> {
    await this.requireActiveGamePlanRow(gamePlanId);
    if (team.role !== "team_admin") {
      throw new ForbiddenException({
        error: { code: errorCode.forbidden, message: "Only a team-admin may archive a game-plan." },
      });
    }
    await this.scoped.db.matchupGamePlan.updateMany({
      where: { id: gamePlanId },
      data: { archivedAt: new Date() },
    });
  }

  /** Record a game-plan lifecycle action on the team activity feed. */
  private async recordActivity(
    team: TeamContext,
    gamePlanId: string,
    verb: "matchup_game_plan_created" | "matchup_game_plan_updated",
  ): Promise<void> {
    await this.activity.recordActivity(team, {
      verb,
      subjectType: "matchup_game_plan",
      subjectId: gamePlanId,
    });
  }

  /** Read a non-archived plan (team-scoped), or throw 404. */
  private async requireActiveGamePlanRow(gamePlanId: string): Promise<GamePlanRow> {
    const row = (await this.scoped.db.matchupGamePlan.findFirst({
      where: { id: gamePlanId, archivedAt: null },
      include: GAME_PLAN_INCLUDE,
    })) as GamePlanRow | null;
    if (!row) {
      throw gamePlanNotFound();
    }
    return row;
  }

  /**
   * Validate that every attached meta-deck-entry id belongs to the team (a
   * cross-team/missing id is a domain-rule 422; the team-scoped read never leaks
   * existence). Returns the distinct ids to persist.
   */
  private async assertTeamMetaDeckEntries(entryIds: string[]): Promise<string[]> {
    for (const entryId of entryIds) {
      const entry = await this.scoped.db.metaDeckEntry.findFirst({
        where: { id: entryId },
        select: { id: true },
      });
      if (!entry) {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.domainRuleViolation,
            message: "An attached meta deck entry does not belong to this team.",
          },
        });
      }
    }
    return entryIds;
  }

  /**
   * Replace a plan's attached meta deck entries with exactly `entryIds`. The parent
   * plan is already verified team-scoped and the entries validated same-team, so
   * operating on the join rows by `gamePlanId` is safe (the join carries no teamId;
   * it is reached through its parents).
   */
  private async replaceAttachedEntries(gamePlanId: string, entryIds: string[]): Promise<void> {
    await this.scoped.db.gamePlanMetaDeckEntry.deleteMany({ where: { gamePlanId } });
    if (entryIds.length > 0) {
      await this.scoped.db.gamePlanMetaDeckEntry.createMany({
        data: entryIds.map((metaDeckEntryId) => ({ gamePlanId, metaDeckEntryId })),
      });
    }
  }

  /** Reject an `ourDeckId` that does not belong to the team (cross-team FK → 422). */
  private async assertTeamDeck(deckId: string): Promise<void> {
    const deck = await this.scoped.db.deck.findFirst({
      where: { id: deckId },
      select: { id: true },
    });
    if (!deck) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "The deck does not belong to this team.",
        },
      });
    }
  }
}

function gamePlanNotFound(): NotFoundException {
  return new NotFoundException({
    error: { code: errorCode.notFound, message: "Game-plan not found." },
  });
}

function toMatchupGamePlan(row: GamePlanRow): MatchupGamePlan {
  return {
    id: row.id,
    ourDeckId: row.ourDeckId,
    ourDeckName: row.ourDeck.name,
    formatId: row.formatId,
    name: row.name,
    body: row.body,
    metaDeckEntryIds: row.metaDeckEntries.map((link) => link.metaDeckEntryId),
    updatedBy: {
      userId: row.updatedBy.id,
      username: row.updatedBy.username ?? "",
      displayName: row.updatedBy.displayName,
    },
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
