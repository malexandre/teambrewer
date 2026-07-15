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

/** One card's observation counts for a deck (impressive and underperforming, separate). */
export const deckCardObservationSchema = z.object({
  card: cardSummarySchema,
  impressiveCount: z.number().int(),
  underperformingCount: z.number().int(),
});
export type DeckCardObservation = z.infer<typeof deckCardObservationSchema>;

/**
 * `GET /api/decks/:deckId/card-observations` response. `gamesConsidered` is the number
 * of relevant games that contributed at least one of the deck's own captured cards;
 * `observations` is sorted by total observations (impressive + underperforming) desc,
 * then card name asc.
 */
export const deckCardObservationsResponseSchema = z.object({
  deckId: z.string(),
  gamesConsidered: z.number().int(),
  observations: z.array(deckCardObservationSchema),
});
export type DeckCardObservationsResponse = z.infer<typeof deckCardObservationsResponseSchema>;
