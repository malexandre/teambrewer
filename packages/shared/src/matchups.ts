import { z } from "zod";

import { archetypeLabelSchema } from "./events.js";
import { type GameResult } from "./game-log.js";

/**
 * Shared matchup-aggregation contracts and pure math (see
 * docs/features/confidence-and-matchups.md, ADR-0005). This is TeamBrewer's
 * signature computation: turn the team's `GameLog`s into confidence-weighted,
 * self-explaining matchup reads. `GameLog` stays the source of truth — nothing
 * here does I/O; the API service shapes rows and calls these functions, and the
 * web can reuse them for previews.
 *
 * The formula (ADR-0005, refined in phase-07 with the user):
 * - **Weighted win rate** = `Σ(weightᵢ · winᵢ) / Σ(weightᵢ)` over **decisive** games.
 * - **Raw N** = count of games — always shown, includes draws.
 * - **Effective sample** = `Σ(weightᵢ)` over **decisive** games only.
 * - **Draws** are excluded from both the numerator and the effective sample; they
 *   still count in raw N (so raw N can exceed the games behind the rate).
 * - **Trust indicator** = a low/medium/high bucket over the effective sample.
 */

// --- Outcome ----------------------------------------------------------------

/** A game's outcome from our side (side A). Draws are neither win nor loss. */
export type GameOutcome = "win" | "loss" | "draw";

/**
 * Our-side (side A) outcome of a logged game/match: A ahead → win, B ahead →
 * loss, equal → draw (covers a Bo1 `{0,0}` and an unfinished/tied match alike).
 */
export function deriveGameOutcome(result: GameResult): GameOutcome {
  if (result.gamesWonA > result.gamesWonB) return "win";
  if (result.gamesWonA < result.gamesWonB) return "loss";
  return "draw";
}

// --- Trust indicator --------------------------------------------------------

/** How trustworthy a matchup read is, bucketed from its effective sample. */
export const trustIndicatorSchema = z.enum(["low", "medium", "high"]);
export type TrustIndicator = z.infer<typeof trustIndicatorSchema>;

/**
 * Effective-sample cut-offs for the trust buckets (finalized in phase-07 with the
 * user): `low < 5`, `medium 5 ≤ x < 15`, `high ≥ 15`. The single tunable source of
 * truth — a high win rate over a tiny/low-confidence sample must read as untrusted.
 */
export const MATCHUP_TRUST_THRESHOLDS = { medium: 5, high: 15 } as const;

/** Bucket an effective sample (`Σ` of decisive weights) into a trust indicator. */
export function trustIndicator(effectiveSample: number): TrustIndicator {
  if (effectiveSample >= MATCHUP_TRUST_THRESHOLDS.high) return "high";
  if (effectiveSample >= MATCHUP_TRUST_THRESHOLDS.medium) return "medium";
  return "low";
}

// --- Aggregation ------------------------------------------------------------

/** One game feeding an aggregate: its our-side outcome and confidence weight. */
export interface MatchupGame {
  outcome: GameOutcome;
  weight: number;
}

/** The computed read for a single matchup cell. */
export interface MatchupAggregate {
  /** Count of games — always shown; includes draws. */
  rawSampleCount: number;
  /** `Σ` of decisive-game weights (excludes draws). */
  effectiveSample: number;
  /** Weighted win rate over decisive games, or `null` when there are none. */
  weightedWinRate: number | null;
  trustIndicator: TrustIndicator;
}

/** Round to 4 decimals to keep stored/compared values free of float noise. */
function roundToFourDecimals(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Aggregate a bucket of games into a matchup read. Draws are dropped from the
 * numerator and the effective sample (but counted in raw N); the win rate is
 * `null` when no decisive games remain (no division by zero).
 */
export function aggregateMatchup(games: MatchupGame[]): MatchupAggregate {
  let decisiveWeight = 0;
  let winWeight = 0;
  for (const game of games) {
    if (game.outcome === "draw") continue;
    decisiveWeight += game.weight;
    if (game.outcome === "win") winWeight += game.weight;
  }
  const effectiveSample = roundToFourDecimals(decisiveWeight);
  return {
    rawSampleCount: games.length,
    effectiveSample,
    weightedWinRate: decisiveWeight > 0 ? roundToFourDecimals(winWeight / decisiveWeight) : null,
    trustIndicator: trustIndicator(effectiveSample),
  };
}

// --- Coverage ---------------------------------------------------------------

/**
 * Below this effective sample a matchup reads as under-covered by default: it has
 * not yet earned `high` trust, so it is still worth testing. The UI exposes a
 * control to override the threshold.
 */
export const DEFAULT_COVERAGE_MIN_EFFECTIVE_SAMPLE = MATCHUP_TRUST_THRESHOLDS.high;

/**
 * Normalize raw expected-metagame shares (each `0–100`) so they sum to 1, letting
 * coverage prioritize by field share regardless of how the gauntlet's raw shares
 * add up. Guards a zero total (every share → 0).
 */
export function normalizeExpectedShares(shares: number[]): number[] {
  const total = shares.reduce((sum, share) => sum + share, 0);
  if (total <= 0) return shares.map(() => 0);
  return shares.map((share) => roundToFourDecimals(share / total));
}

/** Whether a matchup's effective sample falls below the coverage threshold. */
export function isUnderCovered(effectiveSample: number, minEffectiveSample: number): boolean {
  return effectiveSample < minEffectiveSample;
}

/**
 * Order coverage rows so the highest-field-share, thinnest matchups surface first:
 * by normalized expected share descending, then by the lower effective sample
 * (thinner coverage) first. "Someone must pilot the bogeyman."
 */
export function compareCoverageByPriority(
  first: { normalizedShare: number; effectiveSample: number },
  second: { normalizedShare: number; effectiveSample: number },
): number {
  if (second.normalizedShare !== first.normalizedShare) {
    return second.normalizedShare - first.normalizedShare;
  }
  return first.effectiveSample - second.effectiveSample;
}

// --- Query schemas ----------------------------------------------------------

/** How matchups are grouped on each side: by specific deck or by hero/identity. */
export const matchupGroupingSchema = z.enum(["deck", "hero"]);
export type MatchupGrouping = z.infer<typeof matchupGroupingSchema>;

/**
 * A query-string boolean: only the literal `"true"` is true (so `?byHero=false`
 * and an absent param both read as `false`, unlike `z.coerce.boolean`).
 */
const matchupQueryBooleanSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

/** `GET /api/matchups` — a flat list of matchup cells for a format (+ filters). */
export const matchupQuerySchema = z.object({
  formatId: z.string().min(1, "A format is required."),
  eventId: z.string().min(1).optional(),
  ourDeckId: z.string().min(1).optional(),
  byHero: matchupQueryBooleanSchema,
});
export type MatchupQuery = z.infer<typeof matchupQuerySchema>;

/** `GET /api/matchups/matrix` — the full our-decks × opponents grid. */
export const matchupMatrixQuerySchema = z.object({
  formatId: z.string().min(1, "A format is required."),
  eventId: z.string().min(1).optional(),
  byHero: matchupQueryBooleanSchema,
});
export type MatchupMatrixQuery = z.infer<typeof matchupMatrixQuerySchema>;

/** `GET /api/matchups/coverage` — an event's gauntlet coverage (event-scoped). */
export const matchupCoverageQuerySchema = z.object({
  eventId: z.string().min(1, "An event is required."),
  byHero: matchupQueryBooleanSchema,
  minEffectiveSample: z.coerce.number().min(0).optional(),
});
export type MatchupCoverageQuery = z.infer<typeof matchupCoverageQuerySchema>;

// --- Response shapes --------------------------------------------------------

/** Our-side identity for a matrix row (a deck, or a hero when grouped by hero). */
export const matchupSideSchema = z.object({
  key: z.string(),
  deckId: z.string().nullable(),
  heroId: z.string().nullable(),
  name: z.string(),
});
export type MatchupSide = z.infer<typeof matchupSideSchema>;

/** An opponent identity for a matrix column / coverage target. */
export const matchupOpponentSchema = z.object({
  key: z.string(),
  deckId: z.string().nullable(),
  heroId: z.string().nullable(),
  archetypeLabel: archetypeLabelSchema.nullable(),
  label: z.string(),
});
export type MatchupOpponent = z.infer<typeof matchupOpponentSchema>;

/** The confidence-weighted read for one matchup cell. */
export const matchupCellSchema = z.object({
  weightedWinRate: z.number().nullable(),
  rawSampleCount: z.number().int(),
  effectiveSample: z.number(),
  trustIndicator: trustIndicatorSchema,
});
export type MatchupCell = z.infer<typeof matchupCellSchema>;

/** A single matchup: our side vs an opponent, with its aggregated cell. */
export const matchupSchema = z.object({
  our: matchupSideSchema,
  opponent: matchupOpponentSchema,
  cell: matchupCellSchema,
});
export type Matchup = z.infer<typeof matchupSchema>;

/** `GET /api/matchups` response. */
export const matchupListResponseSchema = z.object({
  grouping: matchupGroupingSchema,
  data: z.array(matchupSchema),
});
export type MatchupListResponse = z.infer<typeof matchupListResponseSchema>;

/** One filled grid intersection, referencing its row and column by key. */
export const matchupMatrixCellSchema = matchupCellSchema.extend({
  rowKey: z.string(),
  columnKey: z.string(),
});
export type MatchupMatrixCell = z.infer<typeof matchupMatrixCellSchema>;

/** `GET /api/matchups/matrix` response: rows × columns with their cells. */
export const matchupMatrixResponseSchema = z.object({
  grouping: matchupGroupingSchema,
  formatId: z.string(),
  eventId: z.string().nullable(),
  rows: z.array(matchupSideSchema),
  columns: z.array(matchupOpponentSchema),
  cells: z.array(matchupMatrixCellSchema),
});
export type MatchupMatrixResponse = z.infer<typeof matchupMatrixResponseSchema>;

/** One of our decks' coverage of a gauntlet target. */
export const matchupCoverageCandidateSchema = z.object({
  our: matchupSideSchema,
  cell: matchupCellSchema,
});
export type MatchupCoverageCandidate = z.infer<typeof matchupCoverageCandidateSchema>;

/** A gauntlet target's coverage: the team's aggregate + per-deck breakdown. */
export const matchupCoverageRowSchema = z.object({
  gauntletEntryId: z.string(),
  opponent: matchupOpponentSchema,
  expectedMetaShare: z.number(),
  normalizedShare: z.number(),
  aggregate: matchupCellSchema,
  isUnderCovered: z.boolean(),
  candidates: z.array(matchupCoverageCandidateSchema),
  /** Test assignees for this matchup — populated once phase-08 exists. */
  assignments: z.array(z.string()),
});
export type MatchupCoverageRow = z.infer<typeof matchupCoverageRowSchema>;

/** `GET /api/matchups/coverage` response. */
export const matchupCoverageResponseSchema = z.object({
  grouping: matchupGroupingSchema,
  eventId: z.string(),
  formatId: z.string(),
  minEffectiveSample: z.number(),
  rows: z.array(matchupCoverageRowSchema),
});
export type MatchupCoverageResponse = z.infer<typeof matchupCoverageResponseSchema>;
