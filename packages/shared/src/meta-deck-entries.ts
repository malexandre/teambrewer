import { z } from "zod";

import { archetypeLabelSchema } from "./events.js";

/**
 * Shared meta-deck-entry contracts (see docs/features/metas.md). A
 * **MetaDeckEntry** is one tiered entry in a meta's opponent-deck list — the
 * reshaped gauntlet. It names exactly one target form (a reference deck, a bare
 * hero, or a free-text archetype label) plus a `tier` (how central the archetype
 * is to the field), replacing the old gauntlet's raw `expectedMetaShare %`.
 *
 * Tenancy: `metaId`/`teamId` and the derived `opponentSnapshotLabel` are stamped
 * server-side — they are never accepted from the client, so create/update inputs
 * omit them and unknown keys are stripped. Game-agnostic: nothing here hard-codes
 * a game's cards or identity.
 */

/**
 * A meta deck entry's tier: how central the archetype is to the current field.
 * Ordered most-central first. Single source of truth for the tier vocabulary.
 */
export const metaTierSchema = z.enum(["meta_defining", "contender", "counter_meta", "fringe"]);
export type MetaTier = z.infer<typeof metaTierSchema>;

/** The tiers as an ordered array (most-central first), for iteration in the UI. */
export const META_TIERS = metaTierSchema.options;

/** Human labels for the tiers (single place so the UI reads consistently). */
export const META_TIER_LABELS: Record<MetaTier, string> = {
  meta_defining: "Meta-defining",
  contender: "Contender",
  counter_meta: "Counter-meta",
  fringe: "Fringe — know it exists",
};

/** Free-form notes on a meta deck entry. */
export const metaDeckEntryNotesSchema = z.string().max(2000);

/** The target forms; exactly one must be provided on a meta deck entry. */
const metaDeckEntryTargetKeys = ["referenceDeckId", "heroId", "archetypeLabel"] as const;

function countPresentTargets(value: {
  referenceDeckId?: unknown;
  heroId?: unknown;
  archetypeLabel?: unknown;
}): number {
  return metaDeckEntryTargetKeys.filter((key) => value[key] !== undefined && value[key] !== null)
    .length;
}

/**
 * Create-meta-deck-entry input. Names exactly one target form — a reference deck,
 * a bare hero, or a free-text archetype label — plus its tier. `metaId`/`teamId`,
 * the derived `opponentSnapshotLabel`, and timestamps are server-stamped and omitted.
 */
export const createMetaDeckEntrySchema = z
  .object({
    tier: metaTierSchema,
    referenceDeckId: z.string().min(1).optional(),
    heroId: z.string().min(1).optional(),
    archetypeLabel: archetypeLabelSchema.optional(),
    notes: metaDeckEntryNotesSchema.default(""),
  })
  .refine((value) => countPresentTargets(value) === 1, {
    message:
      "A meta deck entry must reference exactly one target: a reference deck, a hero, or an archetype label.",
  });
export type CreateMetaDeckEntryInput = z.infer<typeof createMetaDeckEntrySchema>;

/**
 * Update-meta-deck-entry input. The target form is immutable once set (to change
 * it, delete the entry and add a new one), so only the tier and notes may change.
 * The schema is `.strict()`, which rejects any target-form key.
 */
export const updateMetaDeckEntrySchema = z
  .object({
    tier: metaTierSchema.optional(),
    notes: metaDeckEntryNotesSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  });
export type UpdateMetaDeckEntryInput = z.infer<typeof updateMetaDeckEntrySchema>;

/** One meta deck entry as returned by the API. */
export const metaDeckEntrySchema = z.object({
  id: z.string(),
  metaId: z.string(),
  tier: metaTierSchema,
  referenceDeckId: z.string().nullable(),
  heroId: z.string().nullable(),
  archetypeLabel: z.string().nullable(),
  opponentSnapshotLabel: z.string(),
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MetaDeckEntry = z.infer<typeof metaDeckEntrySchema>;

/** A meta's full opponent-deck list. */
export const metaDeckEntryListSchema = z.object({ data: z.array(metaDeckEntrySchema) });
export type MetaDeckEntryList = z.infer<typeof metaDeckEntryListSchema>;
