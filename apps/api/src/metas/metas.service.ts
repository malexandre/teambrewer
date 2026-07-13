import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";

import {
  type CreateMetaDeckEntryInput,
  type CreateMetaInput,
  errorCode,
  type MetaDeckEntry,
  type MetaDeckEntryList,
  type MetaDetail,
  type MetaListQuery,
  type MetaListResponse,
  type MetaSummary,
  type MetaTier,
  type UpdateMetaDeckEntryInput,
  type UpdateMetaInput,
} from "@teambrewer/shared";

import { CollaborationActivityService } from "../collaboration/activity.service.js";
import { decodeKeysetCursor, encodeKeysetCursor } from "../common/keyset-cursor.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";
import { resolveCurrentMeta } from "./current-meta.js";

/** The persisted meta shape this service maps to the shared contracts. */
interface MetaRow {
  id: string;
  teamId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  description: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MetaDeckEntryRow {
  id: string;
  metaId: string;
  tier: MetaTier;
  referenceDeckId: string | null;
  heroId: string | null;
  archetypeLabel: string | null;
  opponentSnapshotLabel: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

/** The normalized single target form of a meta deck entry, plus its derived label. */
interface ResolvedDeckEntryTarget {
  referenceDeckId: string | null;
  heroId: string | null;
  archetypeLabel: string | null;
  opponentSnapshotLabel: string;
}

/**
 * Meta deck entries surface most-central archetypes first: by tier order (as
 * declared in the enum), then oldest-first within a tier.
 */
const META_TIER_ORDER: MetaTier[] = ["meta_defining", "contender", "counter_meta", "fringe"];

/**
 * Team-scoped metas and their tiered opponent-deck lists (docs/features/metas.md,
 * ADR-0010). Every meta/entry query goes through {@link TeamScopedPrisma} so it is
 * filtered by the verified `teamId`; a cross-tenant id simply yields no row (→ 404,
 * never leaking existence). Deck entries carry a `teamId` but are always reached
 * through their team-scoped parent meta. Permissions are a shared team board: any
 * verified member may create/edit/delete any meta or deck entry, so there is no
 * per-resource ownership check beyond membership.
 */
@Injectable()
export class MetasService {
  constructor(
    private readonly scoped: TeamScopedPrisma,
    private readonly activity: CollaborationActivityService,
  ) {}

  /** List the team's non-archived metas, newest-window first, keyset-paginated. */
  async list(query: MetaListQuery): Promise<MetaListResponse> {
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;

    const andClauses: Record<string, unknown>[] = [];
    if (cursor) {
      andClauses.push({
        OR: [
          { startDate: { lt: cursor.sortValue } },
          { startDate: cursor.sortValue, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = (await this.scoped.db.meta.findMany({
      where: {
        archivedAt: null,
        ...(andClauses.length > 0 ? { AND: andClauses } : {}),
      },
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    })) as MetaRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map(toMetaSummary),
      nextCursor: hasMore && last ? encodeKeysetCursor(last.startDate, last.id) : null,
    };
  }

  /**
   * The current meta — the non-archived meta whose window contains today (latest
   * `startDate` wins on overlap). 404 when none is current, so the frontend renders
   * an empty state without special-casing a `null` body.
   */
  async getCurrentMeta(now: Date = new Date()): Promise<MetaDetail> {
    const rows = (await this.scoped.db.meta.findMany({
      where: { archivedAt: null },
    })) as MetaRow[];
    const current = resolveCurrentMeta(rows, now);
    if (!current) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "No meta is current right now." },
      });
    }
    return toMetaDetail(current);
  }

  /** A single meta with its full detail (404 when missing/cross-tenant/archived). */
  async getMeta(metaId: string): Promise<MetaDetail> {
    const row = await this.findMeta(metaId);
    if (!row) {
      throw metaNotFound();
    }
    return toMetaDetail(row);
  }

  /** Create a meta; stamps teamId from context. */
  async create(team: TeamContext, input: CreateMetaInput): Promise<MetaDetail> {
    const created = (await this.scoped.db.meta.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps the same
        // teamId); never from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        name: input.name,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        description: input.description,
      },
    })) as MetaRow;

    await this.recordMetaActivity(team, created.id, "meta_created");
    return toMetaDetail(created);
  }

  /** Update a meta's fields; re-checks the window ordering against the merged row. */
  async update(team: TeamContext, metaId: string, input: UpdateMetaInput): Promise<MetaDetail> {
    const current = await this.requireMeta(metaId);

    const mergedStart =
      input.startDate !== undefined ? new Date(input.startDate) : current.startDate;
    const mergedEnd = input.endDate !== undefined ? new Date(input.endDate) : current.endDate;
    if (mergedEnd.getTime() < mergedStart.getTime()) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "The end date must be on or after the start date.",
        },
      });
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data["name"] = input.name;
    if (input.startDate !== undefined) data["startDate"] = mergedStart;
    if (input.endDate !== undefined) data["endDate"] = mergedEnd;
    if (input.description !== undefined) data["description"] = input.description;

    await this.scoped.db.meta.updateMany({ where: { id: metaId }, data });
    await this.recordMetaActivity(team, metaId, "meta_updated");
    return this.getMeta(metaId);
  }

  /** Soft-delete (archive) a meta; history survives, it leaves default lists. */
  async archive(metaId: string): Promise<void> {
    await this.requireMeta(metaId);
    await this.scoped.db.meta.updateMany({
      where: { id: metaId },
      data: { archivedAt: new Date() },
    });
  }

  /** A meta's opponent-deck list, most-central tier first. */
  async listDeckEntries(metaId: string): Promise<MetaDeckEntryList> {
    await this.requireMeta(metaId);
    const entries = (await this.scoped.db.metaDeckEntry.findMany({
      where: { metaId },
      orderBy: { createdAt: "asc" },
    })) as MetaDeckEntryRow[];
    return { data: sortByTier(entries).map(toMetaDeckEntry) };
  }

  /** Add a deck entry (exactly one target form; target must be valid + unique in the meta). */
  async addDeckEntry(
    team: TeamContext,
    metaId: string,
    input: CreateMetaDeckEntryInput,
  ): Promise<MetaDeckEntry> {
    await this.requireMeta(metaId);
    const target = await this.resolveDeckEntryTarget(metaId, input, team.gameId);

    const created = (await this.scoped.db.metaDeckEntry.create({
      data: {
        metaId,
        // Stamped from context; the same teamId TeamScopedPrisma re-stamps.
        teamId: team.teamId,
        tier: input.tier,
        referenceDeckId: target.referenceDeckId,
        heroId: target.heroId,
        archetypeLabel: target.archetypeLabel,
        opponentSnapshotLabel: target.opponentSnapshotLabel,
        notes: input.notes,
      },
    })) as MetaDeckEntryRow;
    return toMetaDeckEntry(created);
  }

  /** Update a deck entry's tier/notes (the target form is immutable). */
  async updateDeckEntry(
    metaId: string,
    entryId: string,
    input: UpdateMetaDeckEntryInput,
  ): Promise<MetaDeckEntry> {
    await this.requireMeta(metaId);
    await this.requireDeckEntry(metaId, entryId);

    const data: Record<string, unknown> = {};
    if (input.tier !== undefined) data["tier"] = input.tier;
    if (input.notes !== undefined) data["notes"] = input.notes;

    await this.scoped.db.metaDeckEntry.updateMany({ where: { id: entryId }, data });
    const updated = (await this.scoped.db.metaDeckEntry.findFirst({
      where: { id: entryId },
    })) as MetaDeckEntryRow;
    return toMetaDeckEntry(updated);
  }

  /** Remove a deck entry (hard delete — entries are not soft-deleted). */
  async removeDeckEntry(metaId: string, entryId: string): Promise<void> {
    await this.requireMeta(metaId);
    await this.requireDeckEntry(metaId, entryId);
    await this.scoped.db.metaDeckEntry.deleteMany({ where: { id: entryId } });
  }

  /** Record a meta lifecycle action on the team activity feed (metas are a shared board). */
  private async recordMetaActivity(
    team: TeamContext,
    metaId: string,
    verb: "meta_created" | "meta_updated",
  ): Promise<void> {
    await this.activity.recordActivity(team, {
      verb,
      // Metas are not a commentable subject, but their lifecycle is activity-tracked.
      subjectType: "meta",
      subjectId: metaId,
    });
  }

  /** Load a non-archived meta (full row) or throw 404. */
  private async requireMeta(metaId: string): Promise<MetaRow> {
    const row = await this.findMeta(metaId);
    if (!row) {
      throw metaNotFound();
    }
    return row;
  }

  /** Read a non-archived meta row, or null (missing/cross-tenant/archived). */
  private async findMeta(metaId: string): Promise<MetaRow | null> {
    return (await this.scoped.db.meta.findFirst({
      where: { id: metaId, archivedAt: null },
    })) as MetaRow | null;
  }

  /** Load a deck entry that belongs to the meta, or throw 404. */
  private async requireDeckEntry(metaId: string, entryId: string): Promise<void> {
    const row = await this.scoped.db.metaDeckEntry.findFirst({
      where: { id: entryId, metaId },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Meta deck entry not found." },
      });
    }
  }

  /**
   * Validate and normalize a deck entry's single target form and derive its
   * durable snapshot label. A reference deck of another team (or a missing id)
   * yields 404 (cross-tenant, no enumeration); a same-team deck that is not a
   * reference deck, and a hero outside the team's game, are domain-rule 422s; and
   * no matching target may already exist in the meta (→ 422).
   */
  private async resolveDeckEntryTarget(
    metaId: string,
    input: CreateMetaDeckEntryInput,
    gameId: string,
  ): Promise<ResolvedDeckEntryTarget> {
    if (input.referenceDeckId !== undefined) {
      const deck = (await this.scoped.db.deck.findFirst({
        where: { id: input.referenceDeckId, archivedAt: null },
        select: { id: true, name: true, isReference: true },
      })) as { id: string; name: string; isReference: boolean } | null;
      if (!deck) {
        // Missing or another team's deck (team-scoped read) → 404, no enumeration.
        throw new NotFoundException({
          error: { code: errorCode.notFound, message: "Reference deck not found for this team." },
        });
      }
      if (!deck.isReference) {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.domainRuleViolation,
            message: "The referenced deck is not a reference deck for this team.",
          },
        });
      }
      await this.assertNoDuplicateTarget(metaId, { referenceDeckId: input.referenceDeckId });
      return {
        referenceDeckId: input.referenceDeckId,
        heroId: null,
        archetypeLabel: null,
        opponentSnapshotLabel: deck.name,
      };
    }

    if (input.heroId !== undefined) {
      const hero = (await this.scoped.db.hero.findFirst({
        where: { id: input.heroId, gameId, archivedAt: null },
        select: { id: true, name: true },
      })) as { id: string; name: string } | null;
      if (!hero) {
        // Missing or another game's hero → domain-rule 422 (heroes are global,
        // per-game reference data; a wrong-game id is not a tenancy leak).
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.domainRuleViolation,
            message: "The hero does not belong to this team's game.",
          },
        });
      }
      await this.assertNoDuplicateTarget(metaId, { heroId: input.heroId });
      return {
        referenceDeckId: null,
        heroId: input.heroId,
        archetypeLabel: null,
        opponentSnapshotLabel: hero.name,
      };
    }

    const archetypeLabel = input.archetypeLabel as string;
    await this.assertNoDuplicateTarget(metaId, {
      archetypeLabel: { equals: archetypeLabel, mode: "insensitive" },
    });
    return {
      referenceDeckId: null,
      heroId: null,
      archetypeLabel,
      opponentSnapshotLabel: archetypeLabel,
    };
  }

  /** Reject a target already present in the meta's deck list (→ 422). */
  private async assertNoDuplicateTarget(
    metaId: string,
    targetWhere: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.scoped.db.metaDeckEntry.findFirst({
      where: { metaId, ...targetWhere },
      select: { id: true },
    });
    if (existing) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "This target is already in the meta's deck list.",
        },
      });
    }
  }
}

function metaNotFound(): NotFoundException {
  return new NotFoundException({
    error: { code: errorCode.notFound, message: "Meta not found." },
  });
}

/** Sort entries by tier priority (as declared), then oldest-first within a tier. */
function sortByTier(entries: MetaDeckEntryRow[]): MetaDeckEntryRow[] {
  return [...entries].sort((left, right) => {
    const byTier = META_TIER_ORDER.indexOf(left.tier) - META_TIER_ORDER.indexOf(right.tier);
    if (byTier !== 0) {
      return byTier;
    }
    return left.createdAt.getTime() - right.createdAt.getTime();
  });
}

function toMetaSummary(meta: MetaRow): MetaSummary {
  return {
    id: meta.id,
    name: meta.name,
    startDate: meta.startDate.toISOString(),
    endDate: meta.endDate.toISOString(),
    archivedAt: meta.archivedAt ? meta.archivedAt.toISOString() : null,
    createdAt: meta.createdAt.toISOString(),
    updatedAt: meta.updatedAt.toISOString(),
  };
}

function toMetaDetail(meta: MetaRow): MetaDetail {
  return {
    ...toMetaSummary(meta),
    description: meta.description,
  };
}

function toMetaDeckEntry(entry: MetaDeckEntryRow): MetaDeckEntry {
  return {
    id: entry.id,
    metaId: entry.metaId,
    tier: entry.tier,
    referenceDeckId: entry.referenceDeckId,
    heroId: entry.heroId,
    archetypeLabel: entry.archetypeLabel,
    opponentSnapshotLabel: entry.opponentSnapshotLabel,
    notes: entry.notes,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}
