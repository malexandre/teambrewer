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
  /**
   * The `Format.key`s in which this hero is legal, sourced per-format from the
   * card dataset. Empty when the game's source carries no legality (the hero-list
   * read then shows every hero for a format with no coverage — never an empty
   * picker due to missing data).
   */
  legalFormatKeys: z.array(z.string()),
});
export type Hero = z.infer<typeof heroSchema>;

/**
 * Query parameters for `GET /api/heroes`. An optional `formatId` filters the list
 * to heroes legal in that format (coverage-aware server-side — see the heroes
 * endpoint). Validated server-side against the active team's game.
 */
export const heroListQuerySchema = z.object({
  formatId: z.string().optional(),
});
export type HeroListQuery = z.infer<typeof heroListQuerySchema>;

/** Response for `GET /api/heroes` — the active team's game's heroes. */
export const heroListSchema = z.object({
  data: z.array(heroSchema),
});
export type HeroList = z.infer<typeof heroListSchema>;
