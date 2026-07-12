import { z } from "zod";

/**
 * Shared format reference contracts (see card-database.md, game-abstraction.md).
 * Formats are global per-game reference data owned by the game adapter and
 * returned filtered to the active team's game. TeamBrewer surfaces formats as
 * reference context only — it does not enforce legality.
 */

/** A play format for a game (e.g. Classic Constructed, Blitz). */
export const formatSchema = z.object({
  id: z.string(),
  gameId: z.string(),
  key: z.string(),
  name: z.string(),
  isConstructed: z.boolean(),
});
export type Format = z.infer<typeof formatSchema>;

/** Response for `GET /api/formats` — the active team's game's formats. */
export const formatListSchema = z.object({
  data: z.array(formatSchema),
});
export type FormatList = z.infer<typeof formatListSchema>;
