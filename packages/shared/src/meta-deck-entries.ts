import { z } from "zod";

import { archetypeLabelSchema } from "./events.js";

/**
 * Shared meta-deck-entry contracts (see docs/features/metas.md). A
 * **MetaDeckEntry** is one tiered entry in a meta's opponent-deck list — the
 * reshaped gauntlet — modelled as a **matchup subject**: a required free-text
 * `label` (the human archetype name) with an optional `heroId` qualifier, plus a
 * `tier` (how central the archetype is to the field). The same hero may appear
 * more than once under different labels, so entries are distinguished by
 * (hero, label) rather than by hero alone.
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

/** The human archetype name of a meta deck entry (always required). */
export const metaDeckEntryLabelSchema = archetypeLabelSchema;

/** Free-form notes on a meta deck entry. */
export const metaDeckEntryNotesSchema = z.string().max(2000);

/**
 * Create-meta-deck-entry input. A matchup subject: a required `label` with an
 * optional `heroId` qualifier, plus its tier. `metaId`/`teamId`, the derived
 * `opponentSnapshotLabel`, and timestamps are server-stamped and omitted.
 */
export const createMetaDeckEntrySchema = z.object({
  tier: metaTierSchema,
  heroId: z.string().min(1).optional(),
  label: metaDeckEntryLabelSchema,
  notes: metaDeckEntryNotesSchema.default(""),
});
export type CreateMetaDeckEntryInput = z.infer<typeof createMetaDeckEntrySchema>;

/**
 * Update-meta-deck-entry input. The whole matchup subject is editable: `tier`,
 * `label`, the optional `heroId` (pass `null` to clear the hero qualifier), and
 * `notes`. The schema is `.strict()` and requires at least one field; the server
 * re-validates the hero and re-derives the snapshot label.
 */
export const updateMetaDeckEntrySchema = z
  .object({
    tier: metaTierSchema.optional(),
    heroId: z.string().min(1).nullable().optional(),
    label: metaDeckEntryLabelSchema.optional(),
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
  heroId: z.string().nullable(),
  label: z.string(),
  opponentSnapshotLabel: z.string(),
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MetaDeckEntry = z.infer<typeof metaDeckEntrySchema>;

/** A meta's full opponent-deck list. */
export const metaDeckEntryListSchema = z.object({ data: z.array(metaDeckEntrySchema) });
export type MetaDeckEntryList = z.infer<typeof metaDeckEntryListSchema>;
