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
   * A signed −1…+1 "keep/cut" score: a confidence-weighted mean of each relevant game's
   * signal (+1 impressive / −1 underperforming / 0 neutral), shrunk toward 0. See
   * {@link deriveCardObservationScore}. +1 = always impressive in weighty games, −1 = the
   * opposite, 0 = neutral / too little (or too low-weight) evidence to tell.
   */
  score: z.number(),
});
export type DeckCardObservation = z.infer<typeof deckCardObservationSchema>;

/**
 * Neutral-prior strength (in units of weight-1 games) for {@link deriveCardObservationScore}:
 * a thin or low-weight body of evidence stays near 0.5 until real, weighty games accumulate.
 * ~2 games' worth of "no signal" — the moderate setting.
 */
export const CARD_OBSERVATION_SCORE_PRIOR = 2;

/**
 * A card's signed −1…+1 observation score for a deck. It is a **confidence-weighted mean
 * of each relevant game's signal** — `+1` when the card was impressive, `−1` when it
 * underperformed, `0` otherwise — over **all** the deck's relevant games, shrunk toward
 * `0` by a neutral prior:
 *
 *     score = (impressiveWeight − underperformingWeight)
 *             / (totalGameWeight + CARD_OBSERVATION_SCORE_PRIOR)
 *
 * where the weights are sums of the games' confidence weights. So a card impressive in
 * heavy (tournament) games scores higher than one impressive only in low-weight games,
 * a rarely-flagged card trends to ~0 (its impact is spread thin over many games), and
 * thin evidence can't reach the extremes. Clamped to `[-1, 1]`; the single source of truth.
 */
export function deriveCardObservationScore(input: {
  impressiveWeight: number;
  underperformingWeight: number;
  totalGameWeight: number;
}): number {
  const denominator = input.totalGameWeight + CARD_OBSERVATION_SCORE_PRIOR;
  const score =
    denominator > 0 ? (input.impressiveWeight - input.underperformingWeight) / denominator : 0;
  const clamped = Math.min(1, Math.max(-1, score));
  return Math.round(clamped * 10000) / 10000;
}

/**
 * `GET /api/decks/:deckId/card-observations` response. `gamesConsidered` is the total
 * number of relevant games the deck participated in (its own side matched) — whether or
 * not any card was flagged in them — so a card's counts read against total games played
 * (10 of 12 ≠ 10 of 150). `observations` is sorted by total observations (impressive +
 * underperforming) desc, then card name asc.
 */
export const deckCardObservationsResponseSchema = z.object({
  deckId: z.string(),
  gamesConsidered: z.number().int(),
  observations: z.array(deckCardObservationSchema),
});
export type DeckCardObservationsResponse = z.infer<typeof deckCardObservationsResponseSchema>;
