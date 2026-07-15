import { z } from "zod";

/**
 * Shared game-plan contracts (see docs/features/gameplans-and-deck-selection.md,
 * docs/domain/playtesting-methodology.md §4). A **MatchupGamePlan** is a written,
 * living guide for a matchup — Flesh and Blood's equivalent of a sideboard guide
 * (equipment/weapon/card choices, mulligan priorities, sequencing, and lines; there
 * are no MTG-style sideboards).
 *
 * A plan is just three things: a free-text **`name`** (the plan's title), the meta
 * decks it **covers** (`metaDeckEntryIds`, which also drive deck readiness), and the
 * **`body`** description. Names are free-form — a deck may have several plans and
 * duplicate names are allowed (no uniqueness constraint).
 *
 * Key cards are referenced inline in the `body` as `+[[cardId]]` tokens (see
 * card-tokens.ts) — the meta-pivot redesign (WS-4) dropped the structured
 * `MatchupGamePlanCard` chip list in favor of the shared `+card` mention model.
 *
 * Tenancy: `teamId` and the author/updater (`updatedById`) are stamped server-side
 * from the verified request context and never accepted from the client, so create/
 * update inputs omit them and unknown keys are stripped. Game-agnostic: nothing here
 * hard-codes a game's cards or identity.
 */

// --- Field schemas ----------------------------------------------------------

/** The plan's free-text title (e.g. "vs Defensive"). Trimmed, required, bounded. */
export const gamePlanNameSchema = z
  .string()
  .trim()
  .min(1, "A game-plan needs a name.")
  .max(100, "The game-plan name must be at most 100 characters.");

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
 * stable `opponentRef` key. The single source of truth shared by meta deck entries,
 * game logs, and readiness matching: a hero-qualified subject keys as
 * `hero:<id>|label:<lowercased>` and a label-only subject as `label:<lowercased>`,
 * so uniqueness holds across the polymorphic target and repeated heroes under
 * different labels stay distinct.
 */
export function deriveMatchupSubjectRef(subject: {
  heroId?: string | null;
  label?: string | null;
}): string {
  const normalizedLabel = (subject.label ?? "").trim().toLowerCase();
  if (subject.heroId) {
    return normalizedLabel
      ? `hero:${subject.heroId}|label:${normalizedLabel}`
      : `hero:${subject.heroId}`;
  }
  return `label:${normalizedLabel}`;
}

// --- Inputs -----------------------------------------------------------------

/**
 * Create-game-plan input: our deck, the format, a free-text `name`, and the body (key
 * cards live inline in the body as `+[[cardId]]` tokens). `metaDeckEntryIds` optionally
 * sets the meta decks the plan covers. `teamId` and `updatedById` are server-stamped
 * and omitted; unknown keys are stripped.
 */
export const createMatchupGamePlanSchema = z.object({
  ourDeckId: z.string().min(1, "A deck is required."),
  formatId: z.string().min(1, "A format is required."),
  name: gamePlanNameSchema,
  body: gamePlanBodySchema,
  metaDeckEntryIds: gamePlanMetaDeckEntryIdsSchema.optional(),
});
export type CreateMatchupGamePlanInput = z.infer<typeof createMatchupGamePlanSchema>;

/**
 * Update-game-plan input. Partial and `.strict()`. Any of the `name`, `body`, or the
 * covered meta decks (`metaDeckEntryIds`, a replacement set) can change; `ourDeckId`
 * and `formatId` are fixed at creation (rejected as unknown keys here).
 */
export const updateMatchupGamePlanSchema = z
  .object({
    name: gamePlanNameSchema.optional(),
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
 * coerced. Archived plans are excluded server-side.
 */
export const matchupGamePlanListQuerySchema = z.object({
  ourDeckId: z.string().optional(),
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
 * A matchup game-plan as returned by the API: its free-text `name`, our deck, the
 * format, the `body`, and `metaDeckEntryIds` — the meta decks it covers (which also
 * drive deck readiness). Key cards are inline `+[[cardId]]` tokens in `body`.
 */
export const matchupGamePlanSchema = z.object({
  id: z.string(),
  ourDeckId: z.string(),
  ourDeckName: z.string(),
  formatId: z.string(),
  name: z.string(),
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
