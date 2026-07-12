import { z } from "zod";

/**
 * Shared card-data provenance contract (see card-database.md, ADR-0007). Lets the
 * UI show "card data as of …" and attribute the sanctioned open source the data
 * was synced from. One record per game.
 */

/** Response for `GET /api/card-data/version` — the active team's game's data provenance. */
export const cardDataVersionSchema = z.object({
  sourceName: z.string(),
  sourceUrl: z.string(),
  sourceVersion: z.string(),
  lastSyncedAt: z.string(),
  cardCount: z.number().int(),
});
export type CardDataVersion = z.infer<typeof cardDataVersionSchema>;
