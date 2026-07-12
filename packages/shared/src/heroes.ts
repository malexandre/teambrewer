import { z } from "zod";

/**
 * Shared hero/identity reference contracts (see card-database.md,
 * game-abstraction.md). "Hero" is Flesh and Blood's identity concept; the generic
 * term is the game adapter's `identityLabel`. Heroes are global per-game reference
 * data, derived from the synced card dataset, returned filtered to the active
 * team's game.
 */

/** A hero/identity for a game, with its class/talent affinities. */
export const heroSchema = z.object({
  id: z.string(),
  name: z.string(),
  classes: z.array(z.string()),
  talents: z.array(z.string()),
  startingLife: z.number().int().nullable(),
  imageUrl: z.string().nullable(),
});
export type Hero = z.infer<typeof heroSchema>;

/** Response for `GET /api/heroes` — the active team's game's heroes. */
export const heroListSchema = z.object({
  data: z.array(heroSchema),
});
export type HeroList = z.infer<typeof heroListSchema>;
