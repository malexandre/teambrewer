import { z } from "zod";

import { cardSummarySchema } from "./cards.js";

/**
 * Shared per-deck **card observations** contracts (see docs/features/decks.md). This
 * rolls up the impressive/underperforming cards captured on game logs (`GameLogCard`)
 * into per-card counts for one deck: how many times each of the deck's own cards was
 * noted impressive and how many times underperforming, across every game relevant to
 * the deck. The two counts are kept **separate and never netted** — a card can be both.
 *
 * "Relevant" is the broadest attribution (see `deck-attribution.ts`): games where the
 * deck was piloted, where a side is a meta deck entry the deck is linked to, where a
 * side is a sibling team deck linked to the same entry, or where a bare hero+label side
 * ref-matches a linked entry. Only the deck's **own** side's cards are counted.
 *
 * Tenancy: the endpoint is team-scoped from the verified context; the deck is validated
 * same-team server-side, and `GameLogCard` is reached only through its team-scoped
 * parent `GameLog`.
 */

/** One card's observation counts + score for a deck (impressive/underperforming kept separate). */
export const deckCardObservationSchema = z.object({
  card: cardSummarySchema,
  impressiveCount: z.number().int(),
  underperformingCount: z.number().int(),
  /**
   * A signed −1…+1 "keep/cut" score measuring how **consistently** the card was flagged
   * impressive vs underperforming across the games where it was flagged, discounting the
   * deck's other games and shrinking toward 0 for thin evidence. See
   * {@link deriveCardObservationScore}. Near +1 = reliably impressive, near −1 = reliably
   * a liability, 0 = balanced / too little evidence to tell.
   */
  score: z.number(),
});
export type DeckCardObservation = z.infer<typeof deckCardObservationSchema>;

/**
 * Neutral-prior strength (in units of weight-1 games) for {@link deriveCardObservationScore}:
 * a thin or low-weight body of evidence stays near 0 until real, weighty games accumulate.
 * ~2 games' worth of "no signal" — the moderate setting.
 */
export const CARD_OBSERVATION_SCORE_PRIOR = 2;

/**
 * How much a game in which the card was **not** flagged still dilutes its score, relative
 * to a game that did flag it, in {@link deriveCardObservationScore}. Teammates don't reliably
 * use the capture feature, so an unflagged game is weak evidence that the card was
 * unremarkable — it should pull the score toward 0 only a little, not one-for-one. At `0.1`,
 * a card underperforming in 5 of 100 games scores ≈ −30% (vs ≈ −5% if unflagged games counted
 * fully). Set to `0` to ignore unflagged games entirely, `1` to weigh them like flagged games.
 */
export const UNFLAGGED_GAME_NEUTRAL_WEIGHT = 0.1;

/**
 * A card's signed −1…+1 observation score for a deck. It measures how **consistently** the
 * card was flagged impressive vs underperforming across the games where it was flagged,
 * discounting the deck's other (unflagged) games and shrinking toward `0` by a neutral prior:
 *
 *     observationWeight = impressiveWeight + underperformingWeight
 *     neutralGameWeight = max(0, totalGameWeight − flaggedGameWeight)
 *     denominator       = observationWeight
 *                         + UNFLAGGED_GAME_NEUTRAL_WEIGHT × neutralGameWeight
 *                         + CARD_OBSERVATION_SCORE_PRIOR
 *     score             = (impressiveWeight − underperformingWeight) / denominator
 *
 * where the weights are sums of the games' confidence weights and `flaggedGameWeight` is the
 * confidence-weighted mass of the **distinct** games in which the card was flagged in any role.
 * So a card impressive in heavy (tournament) games scores higher than one impressive only in
 * low-weight games; a card flagged only a few times, but consistently, still scores strongly
 * (unflagged games are discounted, not full-weight); a card flagged inconsistently nets toward
 * 0; and thin evidence can't reach the extremes. Using `observationWeight` (not
 * `flaggedGameWeight`) as the flagged term keeps `|score| ≤ 1` by construction. Clamped to
 * `[-1, 1]` defensively; the single source of truth.
 */
export function deriveCardObservationScore(input: {
  impressiveWeight: number;
  underperformingWeight: number;
  flaggedGameWeight: number;
  totalGameWeight: number;
}): number {
  const observationWeight = input.impressiveWeight + input.underperformingWeight;
  const neutralGameWeight = Math.max(0, input.totalGameWeight - input.flaggedGameWeight);
  const denominator =
    observationWeight +
    UNFLAGGED_GAME_NEUTRAL_WEIGHT * neutralGameWeight +
    CARD_OBSERVATION_SCORE_PRIOR;
  const score =
    denominator > 0 ? (input.impressiveWeight - input.underperformingWeight) / denominator : 0;
  const clamped = Math.min(1, Math.max(-1, score));
  return Math.round(clamped * 10000) / 10000;
}

/**
 * `GET /api/decks/:deckId/card-observations` response. `gamesConsidered` is the total
 * number of relevant games the deck participated in (its own side matched) — whether or
 * not any card was flagged in them — so a card's raw counts read against total games played
 * (10 of 12 ≠ 10 of 150), and the unflagged games feed the score's discounted-neutral term
 * (see {@link deriveCardObservationScore}). `observations` is sorted by total observations
 * (impressive + underperforming) desc, then card name asc.
 */
export const deckCardObservationsResponseSchema = z.object({
  deckId: z.string(),
  gamesConsidered: z.number().int(),
  observations: z.array(deckCardObservationSchema),
});
export type DeckCardObservationsResponse = z.infer<typeof deckCardObservationsResponseSchema>;
