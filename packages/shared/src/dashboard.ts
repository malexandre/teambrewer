import { z } from "zod";

import { activityEventSchema } from "./activity.js";
import { deckSelectionSchema } from "./deck-selections.js";
import { attendanceStatusSchema, eventSummarySchema } from "./events.js";
import { gameLogSummarySchema } from "./game-log.js";
import {
  DEFAULT_COVERAGE_MIN_EFFECTIVE_SAMPLE,
  matchupCellSchema,
  matchupOpponentSchema,
  normalizeExpectedShares,
  trustIndicatorSchema,
  type TrustIndicator,
} from "./matchups.js";
import { testAssignmentSchema } from "./testing-queue.js";

/**
 * Shared dashboard contracts and the one piece of dashboard logic (see
 * docs/features/dashboard.md, docs/domain/playtesting-methodology.md §3). The
 * dashboard is a read/aggregation surface — it owns no persisted data — so this
 * file carries only composed response shapes plus the pure, deterministic
 * "what to test next" ranking. Nothing here does I/O; the API service composes the
 * existing per-module services and calls `rankTestingPriorities`.
 *
 * Ranking rule (decided with the user, phase-11): rank **per opponent archetype**
 * (one row per gauntlet target) by `priorityScore = normalizedShare × coverageGap`,
 * where `coverageGap = max(0, target − effectiveSample) / target`. High expected
 * field share + thin/low-trust data ⇒ top of the list.
 */

/** A game's outcome from a chosen perspective (mirrors matchups' `GameOutcome`). */
export const gameOutcomeSchema = z.enum(["win", "loss", "draw"]);

// --- "What to test next" ranking -------------------------------------------

/** One gauntlet matchup fed into the ranking: its field share and current coverage. */
export interface TestingPriorityMatchup {
  /** Stable opponent identity key (also the final, deterministic tie-break). */
  opponentKey: string;
  /** Human label for display (e.g. "Fai"). */
  opponentLabel: string;
  /** Raw expected metagame share, 0–100, from the gauntlet entry. */
  expectedMetaShare: number;
  /** Confidence-weighted effective sample (`Σ` of decisive weights) for the matchup. */
  effectiveSample: number;
  trustIndicator: TrustIndicator;
}

/** Input to `rankTestingPriorities`: the gauntlet matchups and the coverage target. */
export interface RankTestingPrioritiesInput {
  matchups: TestingPriorityMatchup[];
  /** Effective sample a matchup should reach to be "covered" (default: 15). */
  targetEffectiveSample?: number;
}

/** A ranked recommendation row: what to test next and why. */
export const rankedPrioritySchema = z.object({
  opponentKey: z.string(),
  opponentLabel: z.string(),
  expectedMetaShare: z.number(),
  normalizedShare: z.number(),
  effectiveSample: z.number(),
  coverageGap: z.number(),
  priorityScore: z.number(),
  trustIndicator: trustIndicatorSchema,
  /** True when the gauntlet has no expected shares set — ranked by coverage gap alone. */
  sharesUnset: z.boolean(),
  reason: z.string(),
});
export type RankedPriority = z.infer<typeof rankedPrioritySchema>;

/** Round to 4 decimals to keep scores free of float noise (matches matchup math). */
function roundToFourDecimals(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** A short, deterministic explanation of why a matchup is (de)prioritized. */
function buildReason(
  expectedMetaShare: number,
  effectiveSample: number,
  target: number,
  coverageGap: number,
  sharesUnset: boolean,
): string {
  const coverage = `${effectiveSample}/${target} effective sample`;
  if (sharesUnset) {
    return `Expected field share is unset — ranked by coverage gap (${coverage}).`;
  }
  const descriptor =
    coverageGap <= 0
      ? "already well covered"
      : coverageGap >= 0.5
        ? "thinly tested"
        : "partially tested";
  return `~${expectedMetaShare}% of the expected field, ${descriptor} (${coverage}).`;
}

/**
 * Rank an event's gauntlet matchups so the highest-share, thinnest-tested archetypes
 * surface first. Deterministic: sorted by `priorityScore` desc, then raw
 * `expectedMetaShare` desc, then `effectiveSample` asc (thinner first), then
 * `opponentKey` asc. When every share is zero the scores collapse to `0` and the list
 * falls back to coverage gap (thinnest first) with `sharesUnset` flagged.
 */
export function rankTestingPriorities(input: RankTestingPrioritiesInput): RankedPriority[] {
  const { matchups } = input;
  if (matchups.length === 0) return [];

  const target = input.targetEffectiveSample ?? DEFAULT_COVERAGE_MIN_EFFECTIVE_SAMPLE;
  const normalizedShares = normalizeExpectedShares(
    matchups.map((matchup) => matchup.expectedMetaShare),
  );
  const totalShare = matchups.reduce((sum, matchup) => sum + matchup.expectedMetaShare, 0);
  const sharesUnset = totalShare <= 0;

  const ranked: RankedPriority[] = matchups.map((matchup, index) => {
    const coverageGapRaw = target > 0 ? Math.max(0, target - matchup.effectiveSample) / target : 0;
    const normalizedShare = normalizedShares[index] ?? 0;
    return {
      opponentKey: matchup.opponentKey,
      opponentLabel: matchup.opponentLabel,
      expectedMetaShare: matchup.expectedMetaShare,
      normalizedShare,
      effectiveSample: matchup.effectiveSample,
      coverageGap: roundToFourDecimals(coverageGapRaw),
      priorityScore: roundToFourDecimals(normalizedShare * coverageGapRaw),
      trustIndicator: matchup.trustIndicator,
      sharesUnset,
      reason: buildReason(
        matchup.expectedMetaShare,
        matchup.effectiveSample,
        target,
        coverageGapRaw,
        sharesUnset,
      ),
    };
  });

  ranked.sort((first, second) => {
    if (second.priorityScore !== first.priorityScore)
      return second.priorityScore - first.priorityScore;
    if (second.expectedMetaShare !== first.expectedMetaShare) {
      return second.expectedMetaShare - first.expectedMetaShare;
    }
    if (first.effectiveSample !== second.effectiveSample) {
      return first.effectiveSample - second.effectiveSample;
    }
    return first.opponentKey < second.opponentKey
      ? -1
      : first.opponentKey > second.opponentKey
        ? 1
        : 0;
  });

  return ranked;
}

// --- Personal dashboard (`GET /api/dashboard/me`) ---------------------------

/**
 * An upcoming event the caller is involved in, with their own RSVP and deck
 * selection (null when they have not RSVP'd / picked yet — the UI nudges).
 */
export const dashboardUpcomingEventSchema = z.object({
  event: eventSummarySchema,
  myAttendance: attendanceStatusSchema.nullable(),
  myDeckSelection: deckSelectionSchema.nullable(),
});
export type DashboardUpcomingEvent = z.infer<typeof dashboardUpcomingEventSchema>;

/**
 * A recent result with its outcome. On `/me` the outcome is from the caller's
 * perspective (flipped when they piloted side B); on `/team` it is from our side
 * (side A). Same shape, documented semantics per endpoint.
 */
export const dashboardRecentResultSchema = z.object({
  log: gameLogSummarySchema,
  outcome: gameOutcomeSchema,
});
export type DashboardRecentResult = z.infer<typeof dashboardRecentResultSchema>;

/** `GET /api/dashboard/me` — the caller's personal, active-team overview. */
export const dashboardMeResponseSchema = z.object({
  assignments: z.array(testAssignmentSchema),
  upcomingEvents: z.array(dashboardUpcomingEventSchema),
  recentResults: z.array(dashboardRecentResultSchema),
});
export type DashboardMeResponse = z.infer<typeof dashboardMeResponseSchema>;

// --- Team dashboard (`GET /api/dashboard/team`) -----------------------------

/** Query for `GET /api/dashboard/team`: an explicit event, else the nearest upcoming. */
export const dashboardTeamQuerySchema = z.object({
  eventId: z.string().min(1).optional(),
});
export type DashboardTeamQuery = z.infer<typeof dashboardTeamQuerySchema>;

/**
 * A gauntlet target's coverage for the team dashboard's condensed gaps strip: the
 * team aggregate plus the display names of members currently assigned to test it.
 */
export const dashboardCoverageGapSchema = z.object({
  gauntletEntryId: z.string(),
  opponent: matchupOpponentSchema,
  expectedMetaShare: z.number(),
  normalizedShare: z.number(),
  aggregate: matchupCellSchema,
  isUnderCovered: z.boolean(),
  assignees: z.array(z.string()),
});
export type DashboardCoverageGap = z.infer<typeof dashboardCoverageGapSchema>;

/** `GET /api/dashboard/team` — the active team's overview for a target event. */
export const dashboardTeamResponseSchema = z.object({
  targetEvent: eventSummarySchema.nullable(),
  minEffectiveSample: z.number(),
  recommendation: z.array(rankedPrioritySchema),
  coverageGaps: z.array(dashboardCoverageGapSchema),
  recentResults: z.array(dashboardRecentResultSchema),
  activityHighlights: z.array(activityEventSchema),
});
export type DashboardTeamResponse = z.infer<typeof dashboardTeamResponseSchema>;
