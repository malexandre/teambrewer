import { z } from "zod";

/**
 * The global catalog of supported games (`GET /api/games`). This is the
 * instance-wide list of which games exist — not team-scoped, unlike per-team
 * game-config. Mirrors the backend `GameCatalogEntry`: `id` is the stable slug
 * stored in `Team.gameId`, `key` is the adapter key, `name` is the label.
 */
export const gameSummarySchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
});
export type GameSummary = z.infer<typeof gameSummarySchema>;

/** Response for `GET /api/games` — the supported-games catalog. */
export const gameSummaryListSchema = z.object({
  data: z.array(gameSummarySchema),
});
export type GameSummaryList = z.infer<typeof gameSummaryListSchema>;
