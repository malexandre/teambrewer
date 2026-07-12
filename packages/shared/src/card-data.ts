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

/** Per-game outcome of an admin-triggered card-data sync. */
export const cardSyncResultSchema = z.object({
  gameId: z.string(),
  cardCount: z.number().int(),
  heroCount: z.number().int(),
  sourceVersion: z.string(),
});
export type CardSyncResult = z.infer<typeof cardSyncResultSchema>;

/** Response for `POST /api/admin/card-data/sync` (instance-admin only). */
export const cardSyncResponseSchema = z.object({
  data: z.array(cardSyncResultSchema),
});
export type CardSyncResponse = z.infer<typeof cardSyncResponseSchema>;
