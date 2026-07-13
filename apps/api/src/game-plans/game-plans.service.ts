import {
  ConflictException,
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
import { assertFormatInGame, assertHeroInGame } from "../common/reference-data-guards.js";
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
  opponentGauntletEntryId: string | null;
  opponentHeroId: string | null;
  opponentArchetypeLabel: string | null;
  opponentRef: string;
  opponentSnapshotLabel: string;
  body: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  ourDeck: { name: string };
  updatedBy: UserRow;
}

/** The resolved opponent columns + normalized key + human snapshot label, ready to persist. */
interface ResolvedOpponent {
  opponentGauntletEntryId: string | null;
  opponentHeroId: string | null;
  opponentArchetypeLabel: string | null;
  opponentRef: string;
  opponentSnapshotLabel: string;
}

const GAME_PLAN_INCLUDE = {
  ourDeck: { select: { name: true } },
  updatedBy: { select: { id: true, username: true, displayName: true } },
} as const;

/**
 * Team-scoped matchup game-plans (docs/features/gameplans-and-deck-selection.md) — a
 * written, living guide for one (our deck × opponent archetype) matchup. Every query
 * goes through {@link TeamScopedPrisma} so it is filtered by the verified `teamId`; a
 * cross-tenant id yields no row (→ 404, never leaking existence). Game-plans are shared
 * team knowledge (no owner): any member may create or edit, and editing updates the one
 * canonical plan in place while stamping `updatedBy`; only a team-admin may archive. The
 * opponent is resolved once into a normalized `opponentRef` key (so the one-canonical
 * plan uniqueness holds across the polymorphic target) plus a durable snapshot label.
 */
@Injectable()
export class GamePlansService {
  constructor(
    private readonly scoped: TeamScopedPrisma,
    private readonly activity: CollaborationActivityService,
  ) {}

  /**
   * List the team's plans with `ourDeckId`/`opponentRef`/`formatId` filters + keyset
   * pagination (newest first). Archived plans are excluded.
   */
  async list(query: MatchupGamePlanListQuery): Promise<MatchupGamePlanListResponse> {
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;

    const andClauses: Record<string, unknown>[] = [];
    if (query.ourDeckId) andClauses.push({ ourDeckId: query.ourDeckId });
    if (query.opponentRef) andClauses.push({ opponentRef: query.opponentRef });
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
   * Create a game-plan. Validates our deck + format belong to the team's game and
   * resolves the single opponent target into its columns + normalized key + snapshot
   * label. Enforces one canonical plan per `(team, ourDeckId, opponentRef, formatId)`
   * — a duplicate is a 409. Stamps `updatedById` from the verified context. Key cards
   * live inline in the body as `+[[cardId]]` tokens (no structured child table).
   */
  async create(team: TeamContext, input: CreateMatchupGamePlanInput): Promise<MatchupGamePlan> {
    await this.assertTeamDeck(input.ourDeckId);
    await assertFormatInGame(this.scoped.db, team.gameId, input.formatId);
    const opponent = await this.resolveOpponent(team.gameId, input);
    await this.assertNoDuplicatePlan(input.ourDeckId, opponent.opponentRef, input.formatId);

    const created = await this.scoped.db.matchupGamePlan.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps teamId);
        // never from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        updatedById: team.userId,
        ourDeckId: input.ourDeckId,
        formatId: input.formatId,
        opponentGauntletEntryId: opponent.opponentGauntletEntryId,
        opponentHeroId: opponent.opponentHeroId,
        opponentArchetypeLabel: opponent.opponentArchetypeLabel,
        opponentRef: opponent.opponentRef,
        opponentSnapshotLabel: opponent.opponentSnapshotLabel,
        body: input.body,
      },
      select: { id: true },
    });

    await this.recordActivity(team, created.id, "matchup_game_plan_created");
    return this.getGamePlan(created.id);
  }

  /**
   * Edit a game-plan in place (any team member). The matchup key is immutable (rejected
   * by the schema); the `body` updates (including its inline `+[[cardId]]` tokens) and
   * `updatedBy` is re-stamped.
   */
  async update(
    team: TeamContext,
    gamePlanId: string,
    input: UpdateMatchupGamePlanInput,
  ): Promise<MatchupGamePlan> {
    await this.requireActiveGamePlanRow(gamePlanId);

    const data: Record<string, unknown> = { updatedById: team.userId };
    if (input.body !== undefined) data["body"] = input.body;
    await this.scoped.db.matchupGamePlan.updateMany({ where: { id: gamePlanId }, data });

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
   * Resolve the single opponent target (already exactly-one-of by the schema) into its
   * persisted columns, a normalized `opponentRef` key (so uniqueness holds across the
   * polymorphic target), and a human `opponentSnapshotLabel`. A gauntlet entry must
   * belong to the team (→ 422); a hero must belong to the team's game (→ 404).
   */
  private async resolveOpponent(
    gameId: string,
    input: {
      opponentGauntletEntryId?: string | undefined;
      opponentHeroId?: string | undefined;
      opponentArchetypeLabel?: string | undefined;
    },
  ): Promise<ResolvedOpponent> {
    const empty = {
      opponentGauntletEntryId: null,
      opponentHeroId: null,
      opponentArchetypeLabel: null,
    };

    if (input.opponentGauntletEntryId !== undefined) {
      const entry = (await this.scoped.db.gauntletEntry.findFirst({
        where: { id: input.opponentGauntletEntryId },
        include: {
          referenceDeck: { select: { name: true } },
          hero: { select: { name: true } },
        },
      })) as {
        referenceDeck: { name: string } | null;
        hero: { name: string } | null;
        archetypeLabel: string | null;
      } | null;
      if (!entry) {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.domainRuleViolation,
            message: "The gauntlet entry does not belong to this team.",
          },
        });
      }
      const label =
        entry.referenceDeck?.name ?? entry.hero?.name ?? entry.archetypeLabel ?? "Gauntlet target";
      return {
        ...empty,
        opponentGauntletEntryId: input.opponentGauntletEntryId,
        opponentRef: `gauntlet:${input.opponentGauntletEntryId}`,
        opponentSnapshotLabel: label,
      };
    }

    if (input.opponentHeroId !== undefined) {
      await assertHeroInGame(this.scoped.db, gameId, input.opponentHeroId);
      const hero = await this.scoped.db.hero.findFirst({
        where: { id: input.opponentHeroId },
        select: { name: true },
      });
      return {
        ...empty,
        opponentHeroId: input.opponentHeroId,
        opponentRef: `hero:${input.opponentHeroId}`,
        opponentSnapshotLabel: hero?.name ?? "Hero",
      };
    }

    const label = input.opponentArchetypeLabel ?? "";
    return {
      ...empty,
      opponentArchetypeLabel: label,
      opponentRef: `label:${label.trim().toLowerCase()}`,
      opponentSnapshotLabel: label,
    };
  }

  /** Enforce the one-canonical-plan-per-matchup rule (→ 409 on a create collision). */
  private async assertNoDuplicatePlan(
    ourDeckId: string,
    opponentRef: string,
    formatId: string,
  ): Promise<void> {
    const existing = await this.scoped.db.matchupGamePlan.findFirst({
      where: { ourDeckId, opponentRef, formatId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        error: {
          code: errorCode.conflict,
          message:
            "A game-plan for this deck, opponent, and format already exists. Edit it instead of creating a new one.",
        },
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
    opponentGauntletEntryId: row.opponentGauntletEntryId,
    opponentHeroId: row.opponentHeroId,
    opponentArchetypeLabel: row.opponentArchetypeLabel,
    opponentRef: row.opponentRef,
    opponentSnapshotLabel: row.opponentSnapshotLabel,
    body: row.body,
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
