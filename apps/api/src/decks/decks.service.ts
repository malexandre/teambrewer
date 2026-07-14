import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import {
  aggregateMatchup,
  type CreateDeckInput,
  type DeckDetail,
  type DeckLinkedMeta,
  type DeckLinkedMetaEntry,
  type DeckListQuery,
  type DeckListResponse,
  type DeckMetaReadinessQuery,
  type DeckMetaReadinessResponse,
  type DeckMetaReadinessRow,
  type DeckStatus,
  type DeckSummary,
  deriveGameOutcome,
  deriveMatchupSubjectRef,
  errorCode,
  type IterationEntry,
  type IterationEntryList,
  type MatchupGame,
  type MetaTier,
  META_TIERS,
  type RecognizedDeckUrl,
  type UpdateDeckInput,
} from "@teambrewer/shared";

import { CollaborationActivityService } from "../collaboration/activity.service.js";
import { decodeKeysetCursor, encodeKeysetCursor } from "../common/keyset-cursor.js";
import { assertFormatInGame, assertHeroInGame } from "../common/reference-data-guards.js";
import { GAME_CATALOG } from "../games/game-catalog.js";
import { GameAdapterRegistry } from "../games/game-adapter.registry.js";
import { findMostRecentMetaForFormat } from "../metas/most-recent-meta.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";
import { canModifyDeck, isDeckVisibleTo } from "./deck-authorization.js";
import { assertDeckStatusTransition } from "./status-transition.js";

/** The persisted deck shape this service maps to the shared contracts. */
interface DeckRow {
  id: string;
  teamId: string;
  name: string;
  gameId: string;
  formatId: string;
  heroId: string | null;
  externalUrl: string;
  source: string;
  ownerId: string;
  status: DeckStatus;
  visibility: "team" | "private";
  tags: string[];
  notes: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A meta deck entry (a label + optional hero matchup subject), loaded for a readiness read. */
interface MetaEntryRow {
  id: string;
  tier: MetaTier;
  heroId: string | null;
  label: string;
  opponentSnapshotLabel: string;
  createdAt: Date;
}

/** The opponent identity + confidence-weighted result fields of a game log, for readiness. */
interface GameLogReadinessRow {
  gamesWonA: number;
  gamesWonB: number;
  confidenceWeight: number;
  opponentDeckId: string | null;
  opponentMetaDeckEntryId: string | null;
  opponentHeroId: string | null;
  opponentArchetypeLabel: string | null;
}

/** Fallback `source` label for a link no adapter recognized. */
const UNRECOGNIZED_SOURCE = "other";

/**
 * Team-scoped deck CRUD, status lifecycle, and the manual iteration log
 * (docs/features/decks.md). Every deck query goes through {@link TeamScopedPrisma}
 * so it is filtered by the verified `teamId`; a cross-tenant id simply yields no
 * row (→ 404). Ownership/visibility are enforced per-resource on top of that.
 * Decks are links (ADR-0002): the service stores metadata only and never fetches
 * or parses the linked contents.
 */
@Injectable()
export class DecksService {
  constructor(
    private readonly scoped: TeamScopedPrisma,
    private readonly gameAdapters: GameAdapterRegistry,
    private readonly activity: CollaborationActivityService,
  ) {}

  /** List the team's decks with filters + keyset pagination (newest first). */
  async list(team: TeamContext, query: DeckListQuery): Promise<DeckListResponse> {
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;

    const andClauses: Record<string, unknown>[] = [];
    // Non-admins never see another member's private drafts.
    if (team.role !== "team_admin") {
      andClauses.push({ OR: [{ visibility: "team" }, { ownerId: team.userId }] });
    }
    if (cursor) {
      andClauses.push({
        OR: [
          { createdAt: { lt: cursor.sortValue } },
          { createdAt: cursor.sortValue, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = (await this.scoped.db.deck.findMany({
      where: {
        archivedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.formatId ? { formatId: query.formatId } : {}),
        ...(query.heroId ? { heroId: query.heroId } : {}),
        ...(query.ownerId ? { ownerId: query.ownerId } : {}),
        ...(query.visibility ? { visibility: query.visibility } : {}),
        ...(query.tag ? { tags: { has: query.tag } } : {}),
        ...(andClauses.length > 0 ? { AND: andClauses } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    })) as DeckRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    const entriesByDeck = await this.loadLinkedMetaEntries(page.map((deck) => deck.id));
    return {
      data: page.map((deck) => toDeckSummary(deck, entriesByDeck.get(deck.id) ?? [])),
      nextCursor: hasMore && last ? encodeKeysetCursor(last.createdAt, last.id) : null,
    };
  }

  /** A single deck (404 when missing, cross-tenant, or a private draft the caller can't see). */
  async getDeck(team: TeamContext, deckId: string): Promise<DeckDetail> {
    const deck = await this.loadVisibleDeck(team, deckId);
    const [linkedMetas, entriesByDeck] = await Promise.all([
      this.loadLinkedMetas(deckId),
      this.loadLinkedMetaEntries([deckId]),
    ]);
    return toDeckDetail(deck, linkedMetas, entriesByDeck.get(deckId) ?? []);
  }

  /**
   * Create a deck; stamps teamId/gameId/ownerId from context and recognizes the link.
   * Links metas per {@link CreateDeckInput.metaIds}: omitting it links the most recent
   * meta of the deck's format by default; passing it (even an empty array) overrides that.
   */
  async create(team: TeamContext, input: CreateDeckInput): Promise<DeckDetail> {
    await assertFormatInGame(this.scoped.db, team.gameId, input.formatId);
    if (input.heroId) {
      await assertHeroInGame(this.scoped.db, team.gameId, input.heroId);
    }
    const metaIdsToLink = await this.resolveMetaIdsToLink(input.metaIds, input.formatId);

    const recognized = this.recognizeUrl(team.gameId, input.externalUrl);
    const created = (await this.scoped.db.deck.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps the same
        // value); never from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        name: input.name,
        gameId: team.gameId,
        formatId: input.formatId,
        heroId: input.heroId ?? null,
        externalUrl: input.externalUrl,
        source: recognized?.provider ?? UNRECOGNIZED_SOURCE,
        ownerId: team.userId,
        visibility: input.visibility,
        tags: input.tags,
        notes: input.notes,
      },
    })) as DeckRow;
    await this.replaceDeckMetaLinks(created.id, metaIdsToLink);
    await this.recordDeckActivity(team, created, "deck_created");
    return this.getDeck(team, created.id);
  }

  /** Update a deck's metadata (owner or team-admin). Status is not editable here. */
  async update(team: TeamContext, deckId: string, input: UpdateDeckInput): Promise<DeckDetail> {
    const deck = await this.loadModifiableDeck(team, deckId);

    if (input.formatId !== undefined) {
      await assertFormatInGame(this.scoped.db, team.gameId, input.formatId);
    }
    if (input.heroId) {
      await assertHeroInGame(this.scoped.db, team.gameId, input.heroId);
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data["name"] = input.name;
    if (input.formatId !== undefined) data["formatId"] = input.formatId;
    if (input.heroId !== undefined) data["heroId"] = input.heroId;
    if (input.visibility !== undefined) data["visibility"] = input.visibility;
    if (input.tags !== undefined) data["tags"] = input.tags;
    if (input.notes !== undefined) data["notes"] = input.notes;
    if (input.externalUrl !== undefined && input.externalUrl !== deck.externalUrl) {
      data["externalUrl"] = input.externalUrl;
      data["source"] =
        this.recognizeUrl(team.gameId, input.externalUrl)?.provider ?? UNRECOGNIZED_SOURCE;
    }

    // `metaIds` is not a deck column — a provided set replaces the deck's links.
    if (Object.keys(data).length > 0) {
      await this.scoped.db.deck.updateMany({ where: { id: deckId }, data });
    }
    if (input.metaIds !== undefined) {
      await this.replaceDeckMetaLinks(deckId, await this.assertTeamMetas(input.metaIds));
    }
    const updated = await this.getDeck(team, deckId);
    await this.recordDeckActivity(team, updated, "deck_updated");
    return updated;
  }

  /** Move a deck through its status lifecycle (validated transition; owner or team-admin). */
  async changeStatus(team: TeamContext, deckId: string, status: DeckStatus): Promise<DeckDetail> {
    const deck = await this.loadModifiableDeck(team, deckId);
    assertDeckStatusTransition(deck.status, status);
    await this.scoped.db.deck.updateMany({ where: { id: deckId }, data: { status } });
    const updated = await this.getDeck(team, deckId);
    await this.recordDeckActivity(team, updated, "deck_status_changed");
    return updated;
  }

  /** Soft-delete (archive) a deck (owner or team-admin); history survives. */
  async archive(team: TeamContext, deckId: string): Promise<void> {
    await this.loadModifiableDeck(team, deckId);
    await this.scoped.db.deck.updateMany({
      where: { id: deckId },
      data: { archivedAt: new Date() },
    });
  }

  /** A deck's iteration log, most-recent first (requires being able to see the deck). */
  async listIterations(team: TeamContext, deckId: string): Promise<IterationEntryList> {
    await this.loadVisibleDeck(team, deckId);
    const entries = await this.scoped.db.deckIterationEntry.findMany({
      where: { deckId },
      orderBy: { createdAt: "desc" },
    });
    return { data: entries.map(toIterationEntry) };
  }

  /** Append an iteration-log entry (owner or team-admin; others comment instead). */
  async addIteration(team: TeamContext, deckId: string, body: string): Promise<IterationEntry> {
    await this.loadModifiableDeck(team, deckId);
    const entry = await this.scoped.db.deckIterationEntry.create({
      data: { deckId, authorId: team.userId, body },
    });
    return toIterationEntry(entry);
  }

  /**
   * Per-deck **meta-readiness** (docs/features/decks.md): for each entry in the meta's
   * deck list, our confidence-weighted read from the team's game logs where side A is
   * this deck and side B matches the entry's target, plus whether a matchup game-plan
   * exists for that pairing. Read-only from `GameLog` (still the source of truth); the
   * math reuses the shared `aggregateMatchup` (draws counted in raw N only). The deck
   * is validated visible/same-team (→ 404); the meta defaults to the current one, and
   * a `metaId` for another team (or a missing/archived meta) is a 404. When no meta is
   * current and none is requested, returns an empty read (graceful no-meta state).
   *
   * `metaId` on the game log is treated as an OPTIONAL narrowing and not required here
   * (game-log meta wiring lands in WS-5): all reps of this deck against the target
   * count, so readiness is meaningful before logs carry a meta.
   */
  async getMetaReadiness(
    team: TeamContext,
    deckId: string,
    query: DeckMetaReadinessQuery,
  ): Promise<DeckMetaReadinessResponse> {
    const deck = await this.loadVisibleDeck(team, deckId);
    const meta = await this.resolveReadinessMeta(query.metaId, deck.formatId);
    if (!meta) {
      return { deckId, metaId: "", metaName: "", rows: [] };
    }

    const entries = (await this.scoped.db.metaDeckEntry.findMany({
      where: { metaId: meta.id },
      select: {
        id: true,
        tier: true,
        heroId: true,
        label: true,
        opponentSnapshotLabel: true,
        createdAt: true,
      },
    })) as MetaEntryRow[];

    // Side A of a readiness read is always this team deck (deckId); only team-deck
    // self logs feed a deck's readiness, so opponent-only identity fields drive matching.
    const games = (await this.scoped.db.gameLog.findMany({
      where: { deckId, archivedAt: null },
      select: {
        gamesWonA: true,
        gamesWonB: true,
        confidenceWeight: true,
        opponentDeckId: true,
        opponentMetaDeckEntryId: true,
        opponentHeroId: true,
        opponentArchetypeLabel: true,
      },
    })) as GameLogReadinessRow[];

    // A matchup game-plan covers an entry either by matching its normalized
    // opponentRef (a hero+label / label-only subject) or by an explicit attachment
    // through GamePlanMetaDeckEntry. Both are loaded from the team-scoped plans.
    const plans = (await this.scoped.db.matchupGamePlan.findMany({
      where: { ourDeckId: deckId, formatId: deck.formatId, archivedAt: null },
      select: { opponentRef: true, metaDeckEntries: { select: { metaDeckEntryId: true } } },
    })) as { opponentRef: string; metaDeckEntries: { metaDeckEntryId: string }[] }[];
    const planRefs = new Set(plans.map((plan) => plan.opponentRef));
    const plannedEntryIds = new Set(
      plans.flatMap((plan) => plan.metaDeckEntries.map((link) => link.metaDeckEntryId)),
    );

    const rows = sortEntriesByTier(entries).map((entry) => {
      const matched = games.filter((game) => gameMatchesEntry(game, entry)).map(toMatchupGame);
      const aggregate = aggregateMatchup(matched);
      const opponentRef = deriveMatchupSubjectRef({ heroId: entry.heroId, label: entry.label });
      return {
        metaDeckEntryId: entry.id,
        tier: entry.tier,
        heroId: entry.heroId,
        label: entry.label,
        opponentSnapshotLabel: entry.opponentSnapshotLabel,
        weightedWinRate: aggregate.weightedWinRate,
        rawSampleCount: aggregate.rawSampleCount,
        effectiveSample: aggregate.effectiveSample,
        trustIndicator: aggregate.trustIndicator,
        hasGamePlan: planRefs.has(opponentRef) || plannedEntryIds.has(entry.id),
      } satisfies DeckMetaReadinessRow;
    });

    return { deckId, metaId: meta.id, metaName: meta.name, rows };
  }

  /**
   * Resolve the meta for a readiness read: an explicit non-archived, same-team meta
   * (→ 404 otherwise), or the most recent meta of the deck's own format, or null when
   * that format has no meta.
   */
  private async resolveReadinessMeta(
    metaId: string | undefined,
    deckFormatId: string,
  ): Promise<{ id: string; name: string } | null> {
    if (metaId !== undefined) {
      const meta = (await this.scoped.db.meta.findFirst({
        where: { id: metaId, archivedAt: null },
        select: { id: true, name: true },
      })) as { id: string; name: string } | null;
      if (!meta) {
        throw new NotFoundException({
          error: { code: errorCode.notFound, message: "Meta not found." },
        });
      }
      return meta;
    }
    return findMostRecentMetaForFormat(this.scoped.db, deckFormatId);
  }

  /** Best-effort deck-URL recognition (URL-pattern only, never a content fetch). */
  recognizeUrl(gameId: string, url: string): RecognizedDeckUrl {
    const entry = GAME_CATALOG.find((catalogEntry) => catalogEntry.id === gameId);
    if (!entry || !this.gameAdapters.has(entry.key)) {
      return null;
    }
    return this.gameAdapters.get(entry.key).recognizeDeckUrl?.(url) ?? null;
  }

  /**
   * Record a deck lifecycle event on the team activity feed. Private drafts are
   * skipped so the team-wide feed never leaks a personal draft's existence
   * (multi-tenancy.md; mirrors DeckSubjectResolver's `isTeamVisible`).
   */
  private async recordDeckActivity(
    team: TeamContext,
    deck: { id: string; visibility: string },
    verb: "deck_created" | "deck_updated" | "deck_status_changed",
  ): Promise<void> {
    if (deck.visibility !== "team") {
      return;
    }
    await this.activity.recordActivity(team, {
      verb,
      subjectType: "deck",
      subjectId: deck.id,
    });
  }

  /**
   * The metas to link on deck-create. `undefined` (omitted) links the most recent meta
   * of the deck's own format by default (or nothing when that format has no meta); an
   * explicit list (even empty) is validated same-team and used as-is.
   */
  private async resolveMetaIdsToLink(
    metaIds: string[] | undefined,
    formatId: string,
  ): Promise<string[]> {
    if (metaIds !== undefined) {
      return this.assertTeamMetas(metaIds);
    }
    const mostRecent = await findMostRecentMetaForFormat(this.scoped.db, formatId);
    return mostRecent ? [mostRecent.id] : [];
  }

  /** Reject any meta id that is not a non-archived meta of the team (cross-team → 422). */
  private async assertTeamMetas(metaIds: string[]): Promise<string[]> {
    for (const metaId of metaIds) {
      const meta = await this.scoped.db.meta.findFirst({
        where: { id: metaId, archivedAt: null },
        select: { id: true },
      });
      if (!meta) {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.domainRuleViolation,
            message: "A linked meta does not belong to this team.",
          },
        });
      }
    }
    return metaIds;
  }

  /**
   * Replace a deck's `DeckMeta` links with exactly `metaIds`. The parent deck is
   * already verified team-scoped, so operating on its transitive join rows by
   * `deckId` is safe (DeckMeta carries no `teamId`; it is reached through its parents).
   */
  private async replaceDeckMetaLinks(deckId: string, metaIds: string[]): Promise<void> {
    await this.scoped.db.deckMeta.deleteMany({ where: { deckId } });
    if (metaIds.length > 0) {
      await this.scoped.db.deckMeta.createMany({
        data: metaIds.map((metaId) => ({ deckId, metaId })),
      });
    }
  }

  /**
   * A deck's linked metas (id + name + its chosen entry within each), newest-window
   * first, for the detail response. The entry (if any) seeds the deck form's per-meta
   * entry select and the deck page's link display.
   */
  private async loadLinkedMetas(deckId: string): Promise<DeckLinkedMeta[]> {
    const links = (await this.scoped.db.deckMeta.findMany({
      where: { deckId },
      include: {
        meta: { select: { id: true, name: true, startDate: true } },
        metaDeckEntry: { select: { id: true, opponentSnapshotLabel: true } },
      },
      orderBy: { meta: { startDate: "desc" } },
    })) as {
      meta: { id: string; name: string; startDate: Date };
      metaDeckEntry: { id: string; opponentSnapshotLabel: string } | null;
    }[];
    return links.map((link) => ({
      id: link.meta.id,
      name: link.meta.name,
      metaDeckEntryId: link.metaDeckEntry?.id ?? null,
      metaDeckEntryLabel: link.metaDeckEntry?.opponentSnapshotLabel ?? null,
    }));
  }

  /**
   * The per-meta entry links for a set of decks, keyed by deck id (only the metas
   * where an entry is linked). Feeds `DeckSummary.linkedMetaEntries` so the game
   * logger can annotate a team deck without a per-deck detail fetch.
   */
  private async loadLinkedMetaEntries(
    deckIds: string[],
  ): Promise<Map<string, DeckLinkedMetaEntry[]>> {
    const byDeck = new Map<string, DeckLinkedMetaEntry[]>();
    if (deckIds.length === 0) {
      return byDeck;
    }
    const links = (await this.scoped.db.deckMeta.findMany({
      where: { deckId: { in: deckIds }, metaDeckEntryId: { not: null } },
      include: { metaDeckEntry: { select: { id: true, opponentSnapshotLabel: true } } },
    })) as {
      deckId: string;
      metaId: string;
      metaDeckEntry: { id: string; opponentSnapshotLabel: string } | null;
    }[];
    for (const link of links) {
      if (!link.metaDeckEntry) {
        continue;
      }
      const list = byDeck.get(link.deckId) ?? [];
      list.push({
        metaId: link.metaId,
        metaDeckEntryId: link.metaDeckEntry.id,
        label: link.metaDeckEntry.opponentSnapshotLabel,
      });
      byDeck.set(link.deckId, list);
    }
    return byDeck;
  }

  /** Load a deck the caller may see, or throw 404 (also hides private drafts). */
  private async loadVisibleDeck(team: TeamContext, deckId: string): Promise<DeckRow> {
    const deck = (await this.scoped.db.deck.findFirst({ where: { id: deckId } })) as DeckRow | null;
    if (!deck || deck.archivedAt !== null || !isDeckVisibleTo(team, deck)) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Deck not found." },
      });
    }
    return deck;
  }

  /** Load a deck the caller may modify: 404 if not visible, 403 if visible but not owner/admin. */
  private async loadModifiableDeck(team: TeamContext, deckId: string): Promise<DeckRow> {
    const deck = await this.loadVisibleDeck(team, deckId);
    if (!canModifyDeck(team, deck)) {
      throw new ForbiddenException({
        error: {
          code: errorCode.forbidden,
          message: "You can only modify your own decks.",
        },
      });
    }
    return deck;
  }
}

function toDeckSummary(deck: DeckRow, linkedMetaEntries: DeckLinkedMetaEntry[] = []): DeckSummary {
  return {
    id: deck.id,
    name: deck.name,
    gameId: deck.gameId,
    formatId: deck.formatId,
    heroId: deck.heroId,
    externalUrl: deck.externalUrl,
    source: deck.source,
    ownerId: deck.ownerId,
    status: deck.status,
    visibility: deck.visibility,
    tags: deck.tags,
    linkedMetaEntries,
    archivedAt: deck.archivedAt ? deck.archivedAt.toISOString() : null,
    createdAt: deck.createdAt.toISOString(),
    updatedAt: deck.updatedAt.toISOString(),
  };
}

function toDeckDetail(
  deck: DeckRow,
  linkedMetas: DeckLinkedMeta[],
  linkedMetaEntries: DeckLinkedMetaEntry[],
): DeckDetail {
  return { ...toDeckSummary(deck, linkedMetaEntries), notes: deck.notes, linkedMetas };
}

/** Order readiness rows by tier priority (as declared), then oldest entry first. */
function sortEntriesByTier(entries: MetaEntryRow[]): MetaEntryRow[] {
  return [...entries].sort((left, right) => {
    const byTier = META_TIERS.indexOf(left.tier) - META_TIERS.indexOf(right.tier);
    if (byTier !== 0) {
      return byTier;
    }
    return left.createdAt.getTime() - right.createdAt.getTime();
  });
}

/**
 * Whether a game log's opponent matches a meta deck entry. A game explicitly logged
 * against a meta deck entry matches that entry directly (an explicit link is
 * authoritative). Otherwise a game logged with a hero + archetype-label opponent
 * matches when it normalizes to the same subject ref as the entry's hero + label — so
 * repeated heroes under different labels aggregate distinctly. Team-deck and
 * (self-only) opponents never match a meta entry. Side A (this deck) already filters
 * the games, so only the opponent identity drives matching.
 */
function gameMatchesEntry(game: GameLogReadinessRow, entry: MetaEntryRow): boolean {
  if (game.opponentMetaDeckEntryId !== null) {
    return game.opponentMetaDeckEntryId === entry.id;
  }
  if (game.opponentArchetypeLabel === null) {
    return false;
  }
  const gameRef = deriveMatchupSubjectRef({
    heroId: game.opponentHeroId,
    label: game.opponentArchetypeLabel,
  });
  const entryRef = deriveMatchupSubjectRef({ heroId: entry.heroId, label: entry.label });
  return gameRef === entryRef;
}

/** Map a matched game log to the shared aggregation input (our-side outcome + weight). */
function toMatchupGame(game: GameLogReadinessRow): MatchupGame {
  return {
    outcome: deriveGameOutcome({ gamesWonA: game.gamesWonA, gamesWonB: game.gamesWonB }),
    weight: game.confidenceWeight,
  };
}

function toIterationEntry(entry: {
  id: string;
  deckId: string;
  authorId: string;
  body: string;
  createdAt: Date;
}): IterationEntry {
  return {
    id: entry.id,
    deckId: entry.deckId,
    authorId: entry.authorId,
    body: entry.body,
    createdAt: entry.createdAt.toISOString(),
  };
}
