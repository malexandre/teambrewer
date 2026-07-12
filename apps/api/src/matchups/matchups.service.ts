import { Injectable, NotFoundException } from "@nestjs/common";

import {
  aggregateMatchup,
  compareCoverageByPriority,
  DEFAULT_COVERAGE_MIN_EFFECTIVE_SAMPLE,
  deriveGameOutcome,
  errorCode,
  isUnderCovered,
  type MatchupCoverageQuery,
  type MatchupCoverageResponse,
  type MatchupCoverageRow,
  type MatchupGame,
  type MatchupGrouping,
  type MatchupListResponse,
  type MatchupMatrixQuery,
  type MatchupMatrixResponse,
  type MatchupOpponent,
  type MatchupQuery,
  type MatchupSide,
  normalizeExpectedShares,
} from "@teambrewer/shared";

import { assertFormatInGame } from "../common/reference-data-guards.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";

/** The columns of `GameLog` this aggregation reads (its confidence-weighted feed). */
interface MatchupLogRow {
  deckId: string;
  opponentDeckId: string | null;
  heroId: string | null;
  archetypeLabel: string | null;
  gamesWonA: number;
  gamesWonB: number;
  confidenceWeight: number;
}

/** A team deck's display fields, batch-loaded for identity resolution. */
interface DeckIdentityRow {
  id: string;
  name: string;
  heroId: string | null;
}

/** One gauntlet target as loaded for coverage / matrix columns. */
interface GauntletTargetRow {
  id: string;
  referenceDeckId: string | null;
  heroId: string | null;
  archetypeLabel: string | null;
  expectedMetaShare: number;
}

/** A grouped matchup bucket that still holds its raw games (aggregated on demand). */
interface MatchupBucket {
  our: MatchupSide;
  opponent: MatchupOpponent;
  games: MatchupGame[];
}

/** Name lookups shared across identity resolution. */
interface IdentityMaps {
  decks: Map<string, DeckIdentityRow>;
  heroNames: Map<string, string>;
}

/**
 * Team-scoped matchup aggregation (docs/features/confidence-and-matchups.md,
 * ADR-0005) — the signature read-only computation. Every query reads `GameLog`
 * (the source of truth) through {@link TeamScopedPrisma}, so it is filtered by the
 * verified `teamId` and can never include another team's games; a cross-tenant
 * `eventId`/`ourDeckId` yields no row (→ 404, never leaking existence). The
 * weighting math lives in one tested place in `packages/shared`
 * ({@link aggregateMatchup}); this service only shapes rows, groups them, and calls
 * that function. `firstPlayerSide` is treated as data, not an aggregation axis (v1).
 */
@Injectable()
export class MatchupsService {
  constructor(private readonly scoped: TeamScopedPrisma) {}

  /** A flat list of matchup cells for a format (+ optional event / our-deck filter). */
  async list(team: TeamContext, query: MatchupQuery): Promise<MatchupListResponse> {
    await assertFormatInGame(this.scoped.db, team.gameId, query.formatId);
    if (query.ourDeckId) {
      await this.requireDeck(query.ourDeckId);
    }
    if (query.eventId) {
      await this.requireEvent(query.eventId);
    }

    const grouping: MatchupGrouping = query.byHero ? "hero" : "deck";
    const logs = await this.loadLogs({
      formatId: query.formatId,
      eventId: query.eventId,
      ourDeckId: query.ourDeckId,
    });
    const maps = await this.loadIdentityMaps(logs);
    const buckets = this.buildBuckets(logs, grouping, maps);
    const data = buckets
      .map((bucket) => ({
        our: bucket.our,
        opponent: bucket.opponent,
        cell: aggregateMatchup(bucket.games),
      }))
      .sort(
        (first, second) =>
          first.our.name.localeCompare(second.our.name) ||
          first.opponent.label.localeCompare(second.opponent.label),
      );
    return { grouping, data };
  }

  /** The full our-decks × opponent-field grid for the matrix UI. */
  async matrix(team: TeamContext, query: MatchupMatrixQuery): Promise<MatchupMatrixResponse> {
    await assertFormatInGame(this.scoped.db, team.gameId, query.formatId);
    if (query.eventId) {
      await this.requireEvent(query.eventId);
    }

    const grouping: MatchupGrouping = query.byHero ? "hero" : "deck";
    const logs = await this.loadLogs({ formatId: query.formatId, eventId: query.eventId });

    // Gauntlet targets seed columns even when they have no logs yet, so the matrix
    // exposes the untested field (an empty cell) rather than hiding it.
    const gauntletTargets = query.eventId ? await this.loadGauntletTargets(query.eventId) : [];
    const maps = await this.loadIdentityMaps(logs, gauntletTargets);
    const buckets = this.buildBuckets(logs, grouping, maps);

    const rows = new Map<string, MatchupSide>();
    const columns = new Map<string, MatchupOpponent>();
    for (const bucket of buckets) {
      rows.set(bucket.our.key, bucket.our);
      columns.set(bucket.opponent.key, bucket.opponent);
    }
    for (const target of gauntletTargets) {
      const opponent = this.gauntletOpponent(target, grouping, maps);
      if (opponent) columns.set(opponent.key, opponent);
    }

    return {
      grouping,
      formatId: query.formatId,
      eventId: query.eventId ?? null,
      rows: [...rows.values()].sort((first, second) => first.name.localeCompare(second.name)),
      columns: [...columns.values()].sort((first, second) =>
        first.label.localeCompare(second.label),
      ),
      cells: buckets.map((bucket) => ({
        rowKey: bucket.our.key,
        columnKey: bucket.opponent.key,
        ...aggregateMatchup(bucket.games),
      })),
    };
  }

  /** An event's gauntlet coverage: which matchups are thin, prioritized by field share. */
  async coverage(query: MatchupCoverageQuery): Promise<MatchupCoverageResponse> {
    const event = await this.requireEvent(query.eventId);
    const grouping: MatchupGrouping = query.byHero ? "hero" : "deck";
    const minEffectiveSample = query.minEffectiveSample ?? DEFAULT_COVERAGE_MIN_EFFECTIVE_SAMPLE;

    const targets = await this.loadGauntletTargets(query.eventId);
    // Coverage measures all relevant reps in the event's format against each target
    // (prep isn't always tagged to the event), so logs are format-scoped here.
    const logs = await this.loadLogs({ formatId: event.formatId });
    const maps = await this.loadIdentityMaps(logs, targets);
    const buckets = this.buildBuckets(logs, grouping, maps);

    const normalizedShares = normalizeExpectedShares(
      targets.map((target) => target.expectedMetaShare),
    );

    const rows: MatchupCoverageRow[] = targets.map((target, index) => {
      const opponent =
        this.gauntletOpponent(target, grouping, maps) ?? this.unknownOpponent(target);
      const relevant = buckets.filter((bucket) => bucket.opponent.key === opponent.key);
      const aggregate = aggregateMatchup(relevant.flatMap((bucket) => bucket.games));

      return {
        gauntletEntryId: target.id,
        opponent,
        expectedMetaShare: target.expectedMetaShare,
        normalizedShare: normalizedShares[index] ?? 0,
        aggregate,
        isUnderCovered: isUnderCovered(aggregate.effectiveSample, minEffectiveSample),
        candidates: relevant
          .map((bucket) => ({ our: bucket.our, cell: aggregateMatchup(bucket.games) }))
          .sort((first, second) => second.cell.effectiveSample - first.cell.effectiveSample),
        // Test assignments arrive with phase-08; degrade gracefully until then.
        assignments: [],
      };
    });

    rows.sort((first, second) =>
      compareCoverageByPriority(
        {
          normalizedShare: first.normalizedShare,
          effectiveSample: first.aggregate.effectiveSample,
        },
        {
          normalizedShare: second.normalizedShare,
          effectiveSample: second.aggregate.effectiveSample,
        },
      ),
    );

    return { grouping, eventId: query.eventId, formatId: event.formatId, minEffectiveSample, rows };
  }

  // --- Internals ------------------------------------------------------------

  /** Load the non-archived team logs feeding an aggregation, scoped server-side. */
  private async loadLogs(filter: {
    formatId: string;
    eventId?: string | undefined;
    ourDeckId?: string | undefined;
  }): Promise<MatchupLogRow[]> {
    return (await this.scoped.db.gameLog.findMany({
      where: {
        archivedAt: null,
        formatId: filter.formatId,
        ...(filter.eventId ? { eventId: filter.eventId } : {}),
        ...(filter.ourDeckId ? { deckId: filter.ourDeckId } : {}),
      },
      select: {
        deckId: true,
        opponentDeckId: true,
        heroId: true,
        archetypeLabel: true,
        gamesWonA: true,
        gamesWonB: true,
        confidenceWeight: true,
      },
    })) as MatchupLogRow[];
  }

  /** Batch-load the deck + hero names referenced by the logs (and gauntlet targets). */
  private async loadIdentityMaps(
    logs: MatchupLogRow[],
    gauntletTargets: GauntletTargetRow[] = [],
  ): Promise<IdentityMaps> {
    const deckIds = new Set<string>();
    for (const log of logs) {
      deckIds.add(log.deckId);
      if (log.opponentDeckId) deckIds.add(log.opponentDeckId);
    }
    for (const target of gauntletTargets) {
      if (target.referenceDeckId) deckIds.add(target.referenceDeckId);
    }

    // Team decks: scoped by teamId through the proxy (cross-team ids simply drop out).
    const decks =
      deckIds.size > 0
        ? ((await this.scoped.db.deck.findMany({
            where: { id: { in: [...deckIds] } },
            select: { id: true, name: true, heroId: true },
          })) as DeckIdentityRow[])
        : [];
    const deckMap = new Map(decks.map((deck) => [deck.id, deck]));

    const heroIds = new Set<string>();
    for (const log of logs) {
      if (log.heroId) heroIds.add(log.heroId);
    }
    for (const deck of decks) {
      if (deck.heroId) heroIds.add(deck.heroId);
    }
    for (const target of gauntletTargets) {
      if (target.heroId) heroIds.add(target.heroId);
    }

    // Hero is a global (per-game) model; the scoping proxy passes it through.
    const heroes =
      heroIds.size > 0
        ? await this.scoped.db.hero.findMany({
            where: { id: { in: [...heroIds] } },
            select: { id: true, name: true },
          })
        : [];
    const heroNames = new Map(heroes.map((hero) => [hero.id, hero.name]));

    return { decks: deckMap, heroNames };
  }

  /** Group logs by (our identity, opponent identity), keeping raw games per bucket. */
  private buildBuckets(
    logs: MatchupLogRow[],
    grouping: MatchupGrouping,
    maps: IdentityMaps,
  ): MatchupBucket[] {
    const buckets = new Map<string, MatchupBucket>();
    for (const log of logs) {
      const opponent = this.opponentIdentity(log, grouping, maps);
      if (!opponent) continue;
      const our = this.ourIdentity(log, grouping, maps);
      const bucketKey = `${our.key} ${opponent.key}`;
      let bucket = buckets.get(bucketKey);
      if (!bucket) {
        bucket = { our, opponent, games: [] };
        buckets.set(bucketKey, bucket);
      }
      bucket.games.push({
        outcome: deriveGameOutcome({ gamesWonA: log.gamesWonA, gamesWonB: log.gamesWonB }),
        weight: log.confidenceWeight,
      });
    }
    return [...buckets.values()];
  }

  /** Our-side identity: a deck, or its hero when grouping by hero (falls back to deck if hero-less). */
  private ourIdentity(
    log: MatchupLogRow,
    grouping: MatchupGrouping,
    maps: IdentityMaps,
  ): MatchupSide {
    const deck = maps.decks.get(log.deckId);
    if (grouping === "hero" && deck?.heroId) {
      return {
        key: `hero:${deck.heroId}`,
        deckId: null,
        heroId: deck.heroId,
        name: maps.heroNames.get(deck.heroId) ?? "Unknown hero",
      };
    }
    return {
      key: `deck:${log.deckId}`,
      deckId: log.deckId,
      heroId: deck?.heroId ?? null,
      name: deck?.name ?? "Unknown deck",
    };
  }

  /** Opponent identity from a log's side-B columns; null when no identity is recorded. */
  private opponentIdentity(
    log: MatchupLogRow,
    grouping: MatchupGrouping,
    maps: IdentityMaps,
  ): MatchupOpponent | null {
    if (log.opponentDeckId) {
      const deck = maps.decks.get(log.opponentDeckId);
      if (grouping === "hero" && deck?.heroId) {
        return this.heroOpponent(deck.heroId, maps);
      }
      return {
        key: `deck:${log.opponentDeckId}`,
        deckId: log.opponentDeckId,
        heroId: deck?.heroId ?? null,
        archetypeLabel: null,
        label: deck?.name ?? "Unknown deck",
      };
    }
    if (log.heroId) {
      return this.heroOpponent(log.heroId, maps);
    }
    if (log.archetypeLabel) {
      return this.archetypeOpponent(log.archetypeLabel);
    }
    return null;
  }

  /** The opponent identity for a gauntlet target (reference deck / hero / archetype). */
  private gauntletOpponent(
    target: GauntletTargetRow,
    grouping: MatchupGrouping,
    maps: IdentityMaps,
  ): MatchupOpponent | null {
    if (target.referenceDeckId) {
      const deck = maps.decks.get(target.referenceDeckId);
      if (grouping === "hero" && deck?.heroId) {
        return this.heroOpponent(deck.heroId, maps);
      }
      return {
        key: `deck:${target.referenceDeckId}`,
        deckId: target.referenceDeckId,
        heroId: deck?.heroId ?? null,
        archetypeLabel: null,
        label: deck?.name ?? "Unknown deck",
      };
    }
    if (target.heroId) {
      return this.heroOpponent(target.heroId, maps);
    }
    if (target.archetypeLabel) {
      return this.archetypeOpponent(target.archetypeLabel);
    }
    return null;
  }

  private heroOpponent(heroId: string, maps: IdentityMaps): MatchupOpponent {
    return {
      key: `hero:${heroId}`,
      deckId: null,
      heroId,
      archetypeLabel: null,
      label: maps.heroNames.get(heroId) ?? "Unknown hero",
    };
  }

  private archetypeOpponent(archetypeLabel: string): MatchupOpponent {
    return {
      key: `archetype:${archetypeLabel.toLowerCase()}`,
      deckId: null,
      heroId: null,
      archetypeLabel,
      label: archetypeLabel,
    };
  }

  private unknownOpponent(target: GauntletTargetRow): MatchupOpponent {
    return {
      key: `gauntlet:${target.id}`,
      deckId: null,
      heroId: null,
      archetypeLabel: null,
      label: "Unknown target",
    };
  }

  /** Load a non-archived event (id + formatId) or throw 404 (cross-tenant → null). */
  private async requireEvent(eventId: string): Promise<{ id: string; formatId: string }> {
    const event = (await this.scoped.db.event.findFirst({
      where: { id: eventId, archivedAt: null },
      select: { id: true, formatId: true },
    })) as { id: string; formatId: string } | null;
    if (!event) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Event not found." },
      });
    }
    return event;
  }

  /** Confirm one of the team's decks exists (cross-tenant/missing → 404). */
  private async requireDeck(deckId: string): Promise<void> {
    const deck = await this.scoped.db.deck.findFirst({
      where: { id: deckId },
      select: { id: true },
    });
    if (!deck) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Deck not found." },
      });
    }
  }

  /** All gauntlet targets for an event (highest field share first). */
  private async loadGauntletTargets(eventId: string): Promise<GauntletTargetRow[]> {
    return (await this.scoped.db.gauntletEntry.findMany({
      where: { eventId },
      orderBy: [{ expectedMetaShare: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        referenceDeckId: true,
        heroId: true,
        archetypeLabel: true,
        expectedMetaShare: true,
      },
    })) as GauntletTargetRow[];
  }
}
