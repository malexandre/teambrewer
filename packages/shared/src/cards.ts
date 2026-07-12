import { z } from "zod";

/**
 * Shared card reference contracts (see card-database.md). Cards are global
 * per-game reference data used only to reference cards by search/autocomplete and
 * to show an image preview — decks are links (ADR-0002), so no card stats, format
 * legality, or printings are stored or exposed. Reads are filtered server-side by
 * the active team's game; `teamId`/`gameId` never come from the client.
 *
 * Game-agnostic: `pitch` is an optional generic integer (Flesh and Blood uses it
 * as part of card identity — name + pitch); nothing here hard-codes FaB specifics.
 */

/** A card as returned by search/autocomplete and card detail. */
export const cardSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Game-specific resource identity component (FaB pitch). Null when the game has none. */
  pitch: z.number().int().nullable(),
  imageUrl: z.string().nullable(),
});
export type CardSummary = z.infer<typeof cardSummarySchema>;

/** Query parameters for `GET /api/cards` (card search / autocomplete). */
export const cardSearchQuerySchema = z.object({
  query: z.string().max(100).optional(),
  pitch: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type CardSearchQuery = z.infer<typeof cardSearchQuerySchema>;

/** Cursor-paginated response for `GET /api/cards`. */
export const cardSearchResponseSchema = z.object({
  data: z.array(cardSummarySchema),
  nextCursor: z.string().nullable(),
});
export type CardSearchResponse = z.infer<typeof cardSearchResponseSchema>;
