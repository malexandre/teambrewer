import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import {
  aggregateMatchup,
  type CardSummary,
  type CreateDeckInput,
  type DeckCardObservation,
  type DeckCardObservationsResponse,
  type DeckDetail,
  type DeckLinkedMeta,
  type DeckLinkedMetaEntry,
  type DeckMetaEntryLink,
  type DeckListQuery,
  type DeckListResponse,
  type DeckMetaReadinessQuery,
  type DeckMetaReadinessResponse,
  type DeckMetaReadinessRow,
  type DeckStatus,
  type DeckSummary,
  deckOwnedGameSides,
  deriveCardObservationScore,
  deriveGameOutcome,
  deriveMatchupSubjectRef,
  errorCode,
  type GameSide,
  type IterationEntry,
  type IterationEntryList,
  matchupSubjectDisplayName,
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

/** Both sides' subject identity + confidence weight + captured cards, for card observations. */
interface GameLogCardObservationRow {
  confidenceWeight: number;
  deckId: string | null;
  selfMetaDeckEntryId: string | null;
  selfHeroId: string | null;
  selfArchetypeLabel: string | null;
  opponentDeckId: string | null;
  opponentMetaDeckEntryId: string | null;
  opponentHeroId: string | null;
  opponentArchetypeLabel: string | null;
  cards: {
    cardId: string;
    role: "impressive" | "underperforming";
    side: GameSide;
    card: { id: string; name: string; pitch: number | null; imageUrl: string | null };
  }[];
}

/** Per-card tally while aggregating: raw counts (shown) + weighted mass per role (for the score). */
interface CardObservationAccumulator {
  card: CardSummary;
  impressiveCount: number;
  underperformingCount: number;
  impressiveWeight: number;
  underperformingWeight: number;
}

/** Fallback `source` label for a link no adapter recognized. */
const UNRECOGNIZED_SOURCE = "other";

/** Prisma select for a meta deck entry's display fields (hero name + label). */
const DECK_ENTRY_DISPLAY_SELECT = {
  id: true,
  label: true,
  opponentSnapshotLabel: true,
  hero: { select: { name: true } },
} as const;

/** A meta deck entry joined with its hero's name, for the `hero · label` display. */
interface DeckEntryDisplayRow {
  id: string;
  label: string;
  opponentSnapshotLabel: string;
  hero: { name: string } | null;
}

/**
 * A deck→entry link's display string: `hero · label` (leads with the hero, per the
 * app-wide rule), falling back to the durable snapshot label if neither resolves.
 */
function entryDisplayName(entry: DeckEntryDisplayRow): string {
  return matchupSubjectDisplayName(entry.hero?.name, entry.label) || entry.opponentSnapshotLabel;
}

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
    const entryLinks = input.metaEntryLinks ?? [];
    await this.assertTeamMetaEntries(entryLinks, metaIdsToLink);

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
    await this.replaceDeckMetaLinks(created.id, metaIdsToLink, entryLinks);
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

    // `metaIds`/`metaEntryLinks` are not deck columns — a provided set replaces the
    // deck's `DeckMeta` links (metas + their per-meta entry).
    if (Object.keys(data).length > 0) {
      await this.scoped.db.deck.updateMany({ where: { id: deckId }, data });
    }
    if (input.metaIds !== undefined || input.metaEntryLinks !== undefined) {
      const current = await this.loadDeckMetaLinks(deckId);
      const metaIdsToLink =
        input.metaIds !== undefined
          ? await this.assertTeamMetas(input.metaIds)
          : current.map((link) => link.metaId);
      const entryLinks =
        input.metaEntryLinks ??
        current.flatMap((link) =>
          link.metaDeckEntryId
            ? [{ metaId: link.metaId, metaDeckEntryId: link.metaDeckEntryId }]
            : [],
        );
      await this.assertTeamMetaEntries(entryLinks, metaIdsToLink);
      await this.replaceDeckMetaLinks(deckId, metaIdsToLink, entryLinks);
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

    // A matchup game-plan covers an entry via its explicit attachments through
    // GamePlanMetaDeckEntry (the "Covers matchups" selection). Loaded team-scoped.
    const plans = (await this.scoped.db.matchupGamePlan.findMany({
      where: { ourDeckId: deckId, formatId: deck.formatId, archivedAt: null },
      select: { metaDeckEntries: { select: { metaDeckEntryId: true } } },
    })) as { metaDeckEntries: { metaDeckEntryId: string }[] }[];
    const plannedEntryIds = new Set(
      plans.flatMap((plan) => plan.metaDeckEntries.map((link) => link.metaDeckEntryId)),
    );

    // Feed matchup data: team decks linked to each entry in this meta (per-meta), so a
    // game whose opponent was such a deck counts toward that entry's matchup.
    const linkRows = (await this.scoped.db.deckMeta.findMany({
      where: { metaId: meta.id, metaDeckEntryId: { not: null } },
      select: { deckId: true, metaDeckEntryId: true },
    })) as { deckId: string; metaDeckEntryId: string | null }[];
    const linkedDecksByEntry = new Map<string, Set<string>>();
    for (const link of linkRows) {
      if (!link.metaDeckEntryId) {
        continue;
      }
      const decks = linkedDecksByEntry.get(link.metaDeckEntryId) ?? new Set<string>();
      decks.add(link.deckId);
      linkedDecksByEntry.set(link.metaDeckEntryId, decks);
    }

    const rows = sortEntriesByTier(entries).map((entry) => {
      const matched = games
        .filter((game) => gameMatchesEntry(game, entry, linkedDecksByEntry.get(entry.id)))
        .map(toMatchupGame);
      const aggregate = aggregateMatchup(matched);
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
        hasGamePlan: plannedEntryIds.has(entry.id),
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

  /**
   * Roll up the impressive/underperforming cards captured on game logs into per-card
   * counts for this deck (see docs/features/decks.md). Counts only the deck's **own**
   * side's cards, across the broadest set of relevant games: where the deck was piloted,
   * where a side is a meta deck entry the deck is linked to, where a side is a sibling
   * team deck linked to the same entry, or where a bare hero+label side ref-matches a
   * linked entry (`deckOwnedGameSides`). The impressive and underperforming counts are
   * kept separate — a card can appear in both. `gamesConsidered` is the total relevant
   * games (whether or not any card was flagged) so counts read against total games
   * played. Read-only; `GameLogCard` has no `teamId` and is reached only through its
   * team-scoped parent `GameLog`.
   */
  async getCardObservations(
    team: TeamContext,
    deckId: string,
  ): Promise<DeckCardObservationsResponse> {
    await this.loadVisibleDeck(team, deckId);

    // The deck's linked meta deck entries, and the closure used for broadest attribution:
    // the entries' subject refs (hero+label fallback) and the sibling decks linked to them.
    const links = await this.loadDeckMetaLinks(deckId);
    const linkedMetaDeckEntryIds = new Set(
      links.map((link) => link.metaDeckEntryId).filter((id): id is string => id !== null),
    );
    const entryIds = [...linkedMetaDeckEntryIds];
    const entries = entryIds.length
      ? ((await this.scoped.db.metaDeckEntry.findMany({
          where: { id: { in: entryIds } },
          select: { id: true, heroId: true, label: true },
        })) as { id: string; heroId: string | null; label: string }[])
      : [];
    const linkedEntrySubjectRefs = new Set(
      entries.map((entry) => deriveMatchupSubjectRef({ heroId: entry.heroId, label: entry.label })),
    );
    const linkedHeroIds = [
      ...new Set(entries.map((entry) => entry.heroId).filter((id): id is string => id !== null)),
    ];
    const labelOnlyLabels = entries
      .filter((entry) => entry.heroId === null)
      .map((entry) => entry.label);

    const siblingLinks = entryIds.length
      ? ((await this.scoped.db.deckMeta.findMany({
          where: { metaDeckEntryId: { in: entryIds } },
          select: { deckId: true },
        })) as { deckId: string }[])
      : [];
    const siblingDeckIds = new Set(
      siblingLinks.map((link) => link.deckId).filter((id) => id !== deckId),
    );
    const siblingIds = [...siblingDeckIds];

    // Superset of candidate games (team-scoped, with at least one captured card). The
    // hero/label branches over-select; `deckOwnedGameSides` is authoritative below and
    // drops the false positives (e.g. a linked hero under a non-matching label).
    const games = (await this.scoped.db.gameLog.findMany({
      where: {
        archivedAt: null,
        OR: [
          { deckId },
          { opponentDeckId: deckId },
          ...(entryIds.length
            ? [
                { selfMetaDeckEntryId: { in: entryIds } },
                { opponentMetaDeckEntryId: { in: entryIds } },
              ]
            : []),
          ...(siblingIds.length
            ? [{ deckId: { in: siblingIds } }, { opponentDeckId: { in: siblingIds } }]
            : []),
          ...(linkedHeroIds.length
            ? [{ selfHeroId: { in: linkedHeroIds } }, { opponentHeroId: { in: linkedHeroIds } }]
            : []),
          ...(labelOnlyLabels.length
            ? [
                { selfArchetypeLabel: { in: labelOnlyLabels } },
                { opponentArchetypeLabel: { in: labelOnlyLabels } },
              ]
            : []),
        ],
      },
      select: {
        confidenceWeight: true,
        deckId: true,
        selfMetaDeckEntryId: true,
        selfHeroId: true,
        selfArchetypeLabel: true,
        opponentDeckId: true,
        opponentMetaDeckEntryId: true,
        opponentHeroId: true,
        opponentArchetypeLabel: true,
        cards: {
          select: {
            cardId: true,
            role: true,
            side: true,
            card: { select: { id: true, name: true, pitch: true, imageUrl: true } },
          },
        },
      },
    })) as GameLogCardObservationRow[];

    const identity = {
      deckId,
      linkedMetaDeckEntryIds,
      siblingDeckIds,
      linkedEntrySubjectRefs,
    };
    // Per card: raw counts (shown) + confidence-weighted mass per role (for the score).
    const byCard = new Map<string, CardObservationAccumulator>();
    let gamesConsidered = 0;
    let totalGameWeight = 0;
    for (const game of games) {
      const ownedSides = new Set(
        deckOwnedGameSides(
          {
            sideA: {
              deckId: game.deckId,
              metaDeckEntryId: game.selfMetaDeckEntryId,
              heroId: game.selfHeroId,
              archetypeLabel: game.selfArchetypeLabel,
            },
            sideB: {
              deckId: game.opponentDeckId,
              metaDeckEntryId: game.opponentMetaDeckEntryId,
              heroId: game.opponentHeroId,
              archetypeLabel: game.opponentArchetypeLabel,
            },
          },
          identity,
        ),
      );
      if (ownedSides.size === 0) {
        continue; // false positive from the hero/label superset above
      }
      // Every relevant game the deck participated in counts toward the denominator,
      // whether or not any card was flagged — so a count reads against total games
      // played (10 of 12 ≠ 10 of 150), not just against the games that had flags, and
      // the score's denominator is the total confidence-weighted game mass.
      gamesConsidered += 1;
      totalGameWeight += game.confidenceWeight;
      for (const captured of game.cards) {
        if (!ownedSides.has(captured.side)) {
          continue; // the deck's own side only, never the opponent's cards
        }
        const existing = byCard.get(captured.cardId) ?? {
          card: captured.card,
          impressiveCount: 0,
          underperformingCount: 0,
          impressiveWeight: 0,
          underperformingWeight: 0,
        };
        if (captured.role === "impressive") {
          existing.impressiveCount += 1;
          existing.impressiveWeight += game.confidenceWeight;
        } else {
          existing.underperformingCount += 1;
          existing.underperformingWeight += game.confidenceWeight;
        }
        byCard.set(captured.cardId, existing);
      }
    }

    const observations = [...byCard.values()]
      .map((accumulator): DeckCardObservation => ({
        card: accumulator.card,
        impressiveCount: accumulator.impressiveCount,
        underperformingCount: accumulator.underperformingCount,
        score: deriveCardObservationScore({
          impressiveWeight: accumulator.impressiveWeight,
          underperformingWeight: accumulator.underperformingWeight,
          totalGameWeight,
        }),
      }))
      .sort((a, b) => {
        const totalDifference =
          b.impressiveCount + b.underperformingCount - (a.impressiveCount + a.underperformingCount);
        return totalDifference !== 0 ? totalDifference : a.card.name.localeCompare(b.card.name);
      });

    return { deckId, gamesConsidered, observations };
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

  /**
   * Reject any per-meta entry link that isn't valid: its meta must be among the metas
   * the deck is linking (`allowedMetaIds`), and the entry must belong to that meta and
   * the team (cross-team/cross-meta → 422). The scoped read hides other teams' entries.
   */
  private async assertTeamMetaEntries(
    entryLinks: DeckMetaEntryLink[],
    allowedMetaIds: string[],
  ): Promise<void> {
    for (const link of entryLinks) {
      if (!allowedMetaIds.includes(link.metaId)) {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.domainRuleViolation,
            message: "An entry link's meta must be one of the deck's linked metas.",
          },
        });
      }
      const entry = await this.scoped.db.metaDeckEntry.findFirst({
        where: { id: link.metaDeckEntryId, metaId: link.metaId },
        select: { id: true },
      });
      if (!entry) {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.domainRuleViolation,
            message: "A linked meta deck entry does not belong to this meta.",
          },
        });
      }
    }
  }

  /** The deck's current `DeckMeta` links (meta id + its chosen entry, if any). */
  private async loadDeckMetaLinks(
    deckId: string,
  ): Promise<{ metaId: string; metaDeckEntryId: string | null }[]> {
    return (await this.scoped.db.deckMeta.findMany({
      where: { deckId },
      select: { metaId: true, metaDeckEntryId: true },
    })) as { metaId: string; metaDeckEntryId: string | null }[];
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
   * Replace a deck's `DeckMeta` links with exactly `metaIds`, attaching each meta's
   * chosen entry from `entryLinks` (per-meta `metaDeckEntryId`, or null). The parent
   * deck is already verified team-scoped, so operating on its transitive join rows by
   * `deckId` is safe (DeckMeta carries no `teamId`; it is reached through its parents).
   */
  private async replaceDeckMetaLinks(
    deckId: string,
    metaIds: string[],
    entryLinks: DeckMetaEntryLink[] = [],
  ): Promise<void> {
    const entryByMeta = new Map(entryLinks.map((link) => [link.metaId, link.metaDeckEntryId]));
    await this.scoped.db.deckMeta.deleteMany({ where: { deckId } });
    if (metaIds.length > 0) {
      await this.scoped.db.deckMeta.createMany({
        data: metaIds.map((metaId) => ({
          deckId,
          metaId,
          metaDeckEntryId: entryByMeta.get(metaId) ?? null,
        })),
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
        metaDeckEntry: { select: DECK_ENTRY_DISPLAY_SELECT },
      },
      orderBy: { meta: { startDate: "desc" } },
    })) as {
      meta: { id: string; name: string; startDate: Date };
      metaDeckEntry: DeckEntryDisplayRow | null;
    }[];
    return links.map((link) => ({
      id: link.meta.id,
      name: link.meta.name,
      metaDeckEntryId: link.metaDeckEntry?.id ?? null,
      metaDeckEntryLabel: link.metaDeckEntry ? entryDisplayName(link.metaDeckEntry) : null,
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
      include: { metaDeckEntry: { select: DECK_ENTRY_DISPLAY_SELECT } },
    })) as {
      deckId: string;
      metaId: string;
      metaDeckEntry: DeckEntryDisplayRow | null;
    }[];
    for (const link of links) {
      if (!link.metaDeckEntry) {
        continue;
      }
      const list = byDeck.get(link.deckId) ?? [];
      list.push({
        metaId: link.metaId,
        metaDeckEntryId: link.metaDeckEntry.id,
        label: entryDisplayName(link.metaDeckEntry),
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
function gameMatchesEntry(
  game: GameLogReadinessRow,
  entry: MetaEntryRow,
  linkedDeckIds?: ReadonlySet<string>,
): boolean {
  // An explicit entry link is authoritative.
  if (game.opponentMetaDeckEntryId !== null) {
    return game.opponentMetaDeckEntryId === entry.id;
  }
  // Feed matchup data: the opponent was a team deck linked to this entry (in this
  // meta) — a teammate piloting the team's build of the meta deck (per-meta link).
  if (linkedDeckIds && game.opponentDeckId !== null && linkedDeckIds.has(game.opponentDeckId)) {
    return true;
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
