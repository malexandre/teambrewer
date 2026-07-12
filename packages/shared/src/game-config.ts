import { z } from "zod";

import { bestOfSchema } from "./game-log.js";

/**
 * Per-game UI configuration the web reads to adapt to the active team's game
 * (docs/architecture/game-abstraction.md). Resolved server-side from the verified
 * team's game via the GameAdapter — never client-supplied.
 */
export const gameConfigSchema = z.object({
  gameId: z.string(),
  identityLabel: z.string(),
  defaultBestOf: bestOfSchema,
});
export type GameConfig = z.infer<typeof gameConfigSchema>;
