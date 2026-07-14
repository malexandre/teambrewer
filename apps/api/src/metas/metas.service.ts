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

/**
 * The persisted meta shape this service maps to the shared contracts, joined with its
 * format's display name (resolved server-side for the `formatName` response field).
 */
interface MetaRow {
  id: string;
  teamId: string;
  formatId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  description: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  format: { name: string };
}

/** Prisma args that join the format name every meta read needs for its response. */
const META_INCLUDE = { format: { select: { name: true } } } as const;

interface MetaDeckEntryRow {
  id: string;
  metaId: string;
  tier: MetaTier;
  heroId: string | null;
  label: string;
  opponentSnapshotLabel: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

/** The normalized matchup subject of a meta deck entry, plus its derived label. */
interface ResolvedDeckEntryTarget {
  heroId: string | null;
  label: string;
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
      include: META_INCLUDE,
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
      include: META_INCLUDE,
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

  /** Create a meta; stamps teamId from context and validates the format is in the team's game. */
  async create(team: TeamContext, input: CreateMetaInput): Promise<MetaDetail> {
    await this.assertFormatInTeamGame(team.gameId, input.formatId);
    const created = (await this.scoped.db.meta.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps the same
        // teamId); never from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        formatId: input.formatId,
        name: input.name,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        description: input.description,
      },
    })) as MetaRow;

    await this.recordMetaActivity(team, created.id, "meta_created");
    return this.getMeta(created.id);
  }

  /**
   * Update a meta's fields; re-checks the window ordering against the merged row and,
   * when the format changes, validates the new format belongs to the team's game (422).
   */
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
    if (input.formatId !== undefined) {
      await this.assertFormatInTeamGame(team.gameId, input.formatId);
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data["name"] = input.name;
    if (input.formatId !== undefined) data["formatId"] = input.formatId;
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

  /** Add a deck entry (a label + optional hero matchup subject; no exact duplicate in the meta). */
  async addDeckEntry(
    team: TeamContext,
    metaId: string,
    input: CreateMetaDeckEntryInput,
  ): Promise<MetaDeckEntry> {
    await this.requireMeta(metaId);
    const target = await this.resolveDeckEntryTarget(metaId, {
      heroId: input.heroId ?? null,
      label: input.label ?? "",
      gameId: team.gameId,
    });

    const created = (await this.scoped.db.metaDeckEntry.create({
      data: {
        metaId,
        // Stamped from context; the same teamId TeamScopedPrisma re-stamps.
        teamId: team.teamId,
        tier: input.tier,
        heroId: target.heroId,
        label: target.label,
        opponentSnapshotLabel: target.opponentSnapshotLabel,
        notes: input.notes,
      },
    })) as MetaDeckEntryRow;
    return toMetaDeckEntry(created);
  }

  /**
   * Update a deck entry's matchup subject (tier, label, hero qualifier) and notes.
   * Re-validates the hero and re-derives the snapshot label; a change that would
   * exactly duplicate another entry in the meta (same hero + same label) is rejected.
   */
  async updateDeckEntry(
    team: TeamContext,
    metaId: string,
    entryId: string,
    input: UpdateMetaDeckEntryInput,
  ): Promise<MetaDeckEntry> {
    await this.requireMeta(metaId);
    const current = await this.requireDeckEntry(metaId, entryId);

    const data: Record<string, unknown> = {};
    if (input.tier !== undefined) data["tier"] = input.tier;
    if (input.notes !== undefined) data["notes"] = input.notes;

    // Re-resolve the matchup subject when the label or hero changes (heroId: null clears it).
    if (input.label !== undefined || input.heroId !== undefined) {
      const mergedHeroId = input.heroId !== undefined ? input.heroId : current.heroId;
      const mergedLabel = input.label ?? current.label;
      const target = await this.resolveDeckEntryTarget(metaId, {
        heroId: mergedHeroId,
        label: mergedLabel,
        gameId: team.gameId,
        excludeEntryId: entryId,
      });
      data["heroId"] = target.heroId;
      data["label"] = target.label;
      data["opponentSnapshotLabel"] = target.opponentSnapshotLabel;
    }

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
      include: META_INCLUDE,
    })) as MetaRow | null;
  }

  /**
   * Reject a format that does not belong to the team's game (→ 422). Formats are
   * global, per-game reference data; a wrong-game format is a domain-rule violation,
   * not a tenancy leak, so it is a 422 (mirroring the meta-deck-entry hero check).
   */
  private async assertFormatInTeamGame(gameId: string, formatId: string): Promise<void> {
    // `format` is a global model; the scoping proxy passes this query through
    // untouched, filtered explicitly by the team's game.
    const format = await this.scoped.db.format.findFirst({
      where: { id: formatId, gameId },
      select: { id: true },
    });
    if (!format) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "The format does not belong to this team's game.",
        },
      });
    }
  }

  /** Load a deck entry that belongs to the meta, or throw 404. */
  private async requireDeckEntry(metaId: string, entryId: string): Promise<MetaDeckEntryRow> {
    const row = (await this.scoped.db.metaDeckEntry.findFirst({
      where: { id: entryId, metaId },
    })) as MetaDeckEntryRow | null;
    if (!row) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Meta deck entry not found." },
      });
    }
    return row;
  }

  /**
   * Validate and normalize a deck entry's matchup subject (an optional hero and an
   * optional label, of which at least one must be present) and derive its durable
   * snapshot label — the label when set, else the hero's name. A hero outside the
   * team's game is a domain-rule 422 (heroes are global, per-game reference data; a
   * wrong-game id is not a tenancy leak). An entry with neither a hero nor a label
   * is a 422, as is one that would exactly duplicate another in the meta — same
   * hero (or both hero-less) and the same label, case-insensitively.
   */
  private async resolveDeckEntryTarget(
    metaId: string,
    input: { heroId: string | null; label?: string; gameId: string; excludeEntryId?: string },
  ): Promise<ResolvedDeckEntryTarget> {
    const normalizedLabel = (input.label ?? "").trim();
    let heroName: string | null = null;
    if (input.heroId !== null) {
      const hero = (await this.scoped.db.hero.findFirst({
        where: { id: input.heroId, gameId: input.gameId, archivedAt: null },
        select: { id: true, name: true },
      })) as { id: string; name: string } | null;
      if (!hero) {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.domainRuleViolation,
            message: "The hero does not belong to this team's game.",
          },
        });
      }
      heroName = hero.name;
    }
    if (input.heroId === null && normalizedLabel.length === 0) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "Enter a hero or an archetype label.",
        },
      });
    }
    await this.assertNoDuplicateTarget(metaId, input.heroId, normalizedLabel, input.excludeEntryId);
    return {
      heroId: input.heroId,
      label: normalizedLabel,
      // The snapshot is the durable display string: the label when set, else the hero.
      opponentSnapshotLabel: normalizedLabel.length > 0 ? normalizedLabel : (heroName as string),
    };
  }

  /**
   * Reject a matchup subject that already exists in the meta's deck list — the same
   * hero (or both hero-less) paired with the same label (case-insensitively). On an
   * edit, the entry being changed is excluded so a no-op re-save is allowed (→ 422).
   */
  private async assertNoDuplicateTarget(
    metaId: string,
    heroId: string | null,
    label: string,
    excludeEntryId?: string,
  ): Promise<void> {
    const existing = await this.scoped.db.metaDeckEntry.findFirst({
      where: {
        metaId,
        heroId,
        label: { equals: label, mode: "insensitive" },
        ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "This archetype is already in the meta's deck list.",
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
    formatId: meta.formatId,
    formatName: meta.format.name,
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
    heroId: entry.heroId,
    label: entry.label,
    opponentSnapshotLabel: entry.opponentSnapshotLabel,
    notes: entry.notes,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}
