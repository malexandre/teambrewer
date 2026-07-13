import { z } from "zod";

import { archetypeLabelSchema } from "./events.js";

/**
 * Shared game-plan contracts (see docs/features/gameplans-and-deck-selection.md,
 * docs/domain/playtesting-methodology.md §4). A **MatchupGamePlan** is a written,
 * living guide for one *(our deck × opponent archetype)* matchup — Flesh and Blood's
 * equivalent of a sideboard guide (equipment/weapon/card choices, mulligan priorities,
 * sequencing, and lines; there are no MTG-style sideboards). There is one canonical
 * plan per `(ourDeckId, opponentRef, formatId)`.
 *
 * Key cards are referenced inline in the `body` as `+[[cardId]]` tokens (see
 * card-tokens.ts) — the meta-pivot redesign (WS-4) dropped the structured
 * `MatchupGamePlanCard` chip list in favor of the shared `+card` mention model.
 *
 * Tenancy: `teamId` and the author/updater (`updatedById`) are stamped server-side
 * from the verified request context; the derived `opponentSnapshotLabel` is resolved
 * from the referenced rows at write time. None of these are accepted from the client,
 * so create/update inputs omit them and unknown keys are stripped. Game-agnostic:
 * nothing here hard-codes a game's cards or identity.
 */

// --- Field schemas ----------------------------------------------------------

/**
 * The written plan body. Rendered as pre-wrapped text with inline `+[[cardId]]`
 * card tokens resolved to card chips at render time (see card-tokens.ts).
 */
export const gamePlanBodySchema = z
  .string()
  .trim()
  .min(1, "A game-plan needs a body.")
  .max(20000, "The game-plan body must be at most 20000 characters.");

// --- Opponent target (exactly one form) -------------------------------------

/** The opponent target forms; exactly one must be provided on a game-plan. */
const opponentRefKeys = [
  "opponentGauntletEntryId",
  "opponentHeroId",
  "opponentArchetypeLabel",
] as const;

function countPresentOpponentRefs(value: {
  opponentGauntletEntryId?: unknown;
  opponentHeroId?: unknown;
  opponentArchetypeLabel?: unknown;
}): number {
  return opponentRefKeys.filter((key) => value[key] !== undefined && value[key] !== null).length;
}

// --- Inputs -----------------------------------------------------------------

/**
 * Create-game-plan input. Names exactly one opponent target form — a gauntlet entry,
 * a bare hero, or a free-text archetype label — plus our deck, the format, and the
 * body (key cards live inline in the body as `+[[cardId]]` tokens). `teamId`,
 * `updatedById`, and the derived `opponentSnapshotLabel` are server-stamped and
 * omitted; unknown keys are stripped.
 */
export const createMatchupGamePlanSchema = z
  .object({
    ourDeckId: z.string().min(1, "A deck is required."),
    formatId: z.string().min(1, "A format is required."),
    opponentGauntletEntryId: z.string().min(1).optional(),
    opponentHeroId: z.string().min(1).optional(),
    opponentArchetypeLabel: archetypeLabelSchema.optional(),
    body: gamePlanBodySchema,
  })
  .refine((value) => countPresentOpponentRefs(value) === 1, {
    message:
      "A game-plan must reference exactly one opponent target: a gauntlet entry, a hero, or an archetype label.",
  });
export type CreateMatchupGamePlanInput = z.infer<typeof createMatchupGamePlanSchema>;

/**
 * Update-game-plan input. Partial and `.strict()`. The matchup key (`ourDeckId`,
 * `formatId`, and the opponent target) is immutable — editing a plan revises its body
 * in place (including its inline `+[[cardId]]` tokens); to change the matchup, create
 * a new plan.
 */
export const updateMatchupGamePlanSchema = z
  .object({
    body: gamePlanBodySchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  });
export type UpdateMatchupGamePlanInput = z.infer<typeof updateMatchupGamePlanSchema>;

/**
 * Query parameters for `GET /api/game-plans`. Values arrive as strings, so `limit` is
 * coerced. Archived plans are excluded server-side. `opponentRef` is a normalized key
 * (`gauntlet:<id>` | `hero:<id>` | `label:<lowercased>`) matching how plans are keyed.
 */
export const matchupGamePlanListQuerySchema = z.object({
  ourDeckId: z.string().optional(),
  opponentRef: z.string().optional(),
  formatId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type MatchupGamePlanListQuery = z.infer<typeof matchupGamePlanListQuerySchema>;

// --- Response shapes --------------------------------------------------------

/** A teammate's display identity, denormalized onto game-plan rows. */
export const gamePlanUserSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
});
export type GamePlanUser = z.infer<typeof gamePlanUserSchema>;

/**
 * A matchup game-plan as returned by the API. The opponent is exposed both as its live
 * reference ids (any may be null) and as `opponentSnapshotLabel` — a human label
 * resolved server-side at write time that survives deletion of a referenced gauntlet
 * entry or hero. `opponentRef` is the normalized key used for the canonical-plan
 * constraint and list filtering. Key cards are inline `+[[cardId]]` tokens in `body`.
 */
export const matchupGamePlanSchema = z.object({
  id: z.string(),
  ourDeckId: z.string(),
  ourDeckName: z.string(),
  formatId: z.string(),
  opponentGauntletEntryId: z.string().nullable(),
  opponentHeroId: z.string().nullable(),
  opponentArchetypeLabel: z.string().nullable(),
  opponentRef: z.string(),
  opponentSnapshotLabel: z.string(),
  body: z.string(),
  updatedBy: gamePlanUserSchema,
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MatchupGamePlan = z.infer<typeof matchupGamePlanSchema>;

/** Cursor-paginated response for `GET /api/game-plans`. */
export const matchupGamePlanListResponseSchema = z.object({
  data: z.array(matchupGamePlanSchema),
  nextCursor: z.string().nullable(),
});
export type MatchupGamePlanListResponse = z.infer<typeof matchupGamePlanListResponseSchema>;
