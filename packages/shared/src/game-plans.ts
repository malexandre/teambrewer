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
 * The opponent is a **matchup subject** mirroring MetaDeckEntry: a required
 * `opponentArchetypeLabel` with an optional `opponentHeroId` qualifier. A plan may
 * also be explicitly attached to specific meta deck entries via `metaDeckEntryIds`.
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

/**
 * The meta deck entries a plan is explicitly attached to. Each id is validated
 * server-side as belonging to the same team. On create, omitting it attaches
 * nothing; on update, passing it **replaces** the whole attached set. Distinct
 * ids only.
 */
export const gamePlanMetaDeckEntryIdsSchema = z
  .array(z.string().min(1))
  .max(50, "A game-plan can attach at most 50 meta deck entries.")
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Attached meta deck entries must be distinct.",
  });

/**
 * Normalize a matchup subject (an optional hero qualifier + a required label) into a
 * stable `opponentRef` key. The single source of truth shared by game-plans, meta
 * deck entries, and readiness matching: a hero-qualified subject keys as
 * `hero:<id>|label:<lowercased>` and a label-only subject as `label:<lowercased>`,
 * so uniqueness holds across the polymorphic target and repeated heroes under
 * different labels stay distinct.
 */
export function deriveMatchupSubjectRef(subject: {
  heroId?: string | null;
  label: string;
}): string {
  const normalizedLabel = subject.label.trim().toLowerCase();
  return subject.heroId
    ? `hero:${subject.heroId}|label:${normalizedLabel}`
    : `label:${normalizedLabel}`;
}

// --- Inputs -----------------------------------------------------------------

/**
 * Create-game-plan input. The opponent is a matchup subject — a required
 * `opponentArchetypeLabel` with an optional `opponentHeroId` qualifier — plus our
 * deck, the format, and the body (key cards live inline in the body as `+[[cardId]]`
 * tokens). `metaDeckEntryIds` optionally attaches the plan to specific meta deck
 * entries. `teamId`, `updatedById`, and the derived `opponentSnapshotLabel`/
 * `opponentRef` are server-stamped and omitted; unknown keys are stripped.
 */
export const createMatchupGamePlanSchema = z.object({
  ourDeckId: z.string().min(1, "A deck is required."),
  formatId: z.string().min(1, "A format is required."),
  opponentHeroId: z.string().min(1).optional(),
  opponentArchetypeLabel: archetypeLabelSchema,
  body: gamePlanBodySchema,
  metaDeckEntryIds: gamePlanMetaDeckEntryIdsSchema.optional(),
});
export type CreateMatchupGamePlanInput = z.infer<typeof createMatchupGamePlanSchema>;

/**
 * Update-game-plan input. Partial and `.strict()`. The matchup key (`ourDeckId`,
 * `formatId`, and the opponent subject) is immutable — editing a plan revises its
 * body in place (including its inline `+[[cardId]]` tokens) and/or replaces its
 * attached meta deck entries; to change the matchup, create a new plan.
 */
export const updateMatchupGamePlanSchema = z
  .object({
    body: gamePlanBodySchema.optional(),
    metaDeckEntryIds: gamePlanMetaDeckEntryIdsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  });
export type UpdateMatchupGamePlanInput = z.infer<typeof updateMatchupGamePlanSchema>;

/**
 * Query parameters for `GET /api/game-plans`. Values arrive as strings, so `limit` is
 * coerced. Archived plans are excluded server-side. `opponentRef` is a normalized key
 * (see {@link deriveMatchupSubjectRef}) matching how plans are keyed.
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
 * reference ids (`opponentHeroId` may be null; `opponentArchetypeLabel` is always
 * present) and as `opponentSnapshotLabel` — a human label resolved server-side at
 * write time that survives deletion of a referenced hero. `opponentRef` is the
 * normalized key used for the canonical-plan constraint and list filtering.
 * `metaDeckEntryIds` lists the meta deck entries the plan is explicitly attached to.
 * Key cards are inline `+[[cardId]]` tokens in `body`.
 */
export const matchupGamePlanSchema = z.object({
  id: z.string(),
  ourDeckId: z.string(),
  ourDeckName: z.string(),
  formatId: z.string(),
  opponentHeroId: z.string().nullable(),
  opponentArchetypeLabel: z.string(),
  opponentRef: z.string(),
  opponentSnapshotLabel: z.string(),
  body: z.string(),
  metaDeckEntryIds: z.array(z.string()),
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
