import { z } from "zod";

/**
 * Shared meta-deck-entry contracts (see docs/features/metas.md). A
 * **MetaDeckEntry** is one tiered entry in a meta's opponent-deck list — the
 * reshaped gauntlet — modelled as a **matchup subject**: an optional `heroId`
 * and an optional free-text `label` (the human archetype name), of which **at
 * least one must be present**, plus a `tier` (how central the archetype is to
 * the field). The same hero may appear more than once under different labels, so
 * entries are distinguished by (hero, label) rather than by hero alone.
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

/**
 * The human archetype name of a meta deck entry. Optional at the field level
 * (an entry may be identified by its hero alone); trimmed, capped, and may be
 * empty. The "hero or label" rule is enforced cross-field on the input schemas.
 */
export const metaDeckEntryLabelSchema = z.string().trim().max(100);

/** Free-form notes on a meta deck entry. */
export const metaDeckEntryNotesSchema = z.string().max(2000);

/**
 * Create-meta-deck-entry input. A matchup subject: an optional `heroId` and an
 * optional `label`, of which **at least one is required**, plus its tier.
 * `metaId`/`teamId`, the derived `opponentSnapshotLabel`, and timestamps are
 * server-stamped and omitted.
 */
export const createMetaDeckEntrySchema = z
  .object({
    tier: metaTierSchema,
    heroId: z.string().min(1).optional(),
    label: metaDeckEntryLabelSchema.optional(),
    notes: metaDeckEntryNotesSchema.default(""),
  })
  .refine((value) => Boolean(value.heroId) || Boolean(value.label && value.label.length > 0), {
    message: "Enter a hero or an archetype label.",
    path: ["label"],
  });
export type CreateMetaDeckEntryInput = z.infer<typeof createMetaDeckEntrySchema>;

/**
 * Update-meta-deck-entry input. The whole matchup subject is editable: `tier`,
 * `label` (pass `""` to clear it), the optional `heroId` (pass `null` to clear
 * the hero qualifier), and `notes`. The schema is `.strict()` and requires at
 * least one field; the server re-validates the hero, keeps the "hero or label"
 * invariant on the merged result, and re-derives the snapshot label.
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

/**
 * Retro-link recorded games to a meta deck entry: the ids of game logs whose
 * opponent (currently unlinked and matching the entry's hero/label) should be
 * bound to this entry. The server validates each id (same-team, unlinked,
 * matching) and rejects the rest. Capped so the request stays bounded.
 */
export const linkGamesToEntrySchema = z.object({
  gameLogIds: z.array(z.string().min(1)).min(1, "Select at least one game.").max(200),
});
export type LinkGamesToEntryInput = z.infer<typeof linkGamesToEntrySchema>;
