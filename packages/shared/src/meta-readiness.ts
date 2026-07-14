import { z } from "zod";

import { trustIndicatorSchema } from "./matchups.js";
import { metaTierSchema } from "./meta-deck-entries.js";

/**
 * Shared per-deck **meta-readiness** contracts (see docs/features/decks.md,
 * docs/features/confidence-and-matchups.md). Readiness answers, for one of our
 * decks, "how ready are we against each deck in the meta?" — a confidence-weighted
 * matchup read (reusing the kept matchup math: `aggregateMatchup` + `trustIndicator`)
 * plus whether a matchup game-plan exists, one row per `MetaDeckEntry`. It is derived
 * read-only from `GameLog` (still the source of truth — no materialized table).
 *
 * Tenancy: the endpoint is team-scoped from the verified context; the deck and meta
 * are validated same-team server-side.
 */

/** Query for `GET /api/decks/:deckId/meta-readiness`; defaults to the most recent meta of the deck's format. */
export const deckMetaReadinessQuerySchema = z.object({
  metaId: z.string().min(1).optional(),
});
export type DeckMetaReadinessQuery = z.infer<typeof deckMetaReadinessQuerySchema>;

/**
 * One readiness row: our deck's confidence-weighted read against a single meta deck
 * entry, plus its tier and whether a game-plan exists for that matchup. `weightedWinRate`
 * is null when there are no decisive games; `rawSampleCount` always includes draws.
 */
export const deckMetaReadinessRowSchema = z.object({
  metaDeckEntryId: z.string(),
  tier: metaTierSchema,
  /** The meta deck entry's optional hero/identity id, so the client can show the hero name. */
  heroId: z.string().nullable(),
  /** The entry's free-text archetype label (may be empty when the entry is hero-only). */
  label: z.string(),
  opponentSnapshotLabel: z.string(),
  weightedWinRate: z.number().nullable(),
  rawSampleCount: z.number().int(),
  effectiveSample: z.number(),
  trustIndicator: trustIndicatorSchema,
  hasGamePlan: z.boolean(),
});
export type DeckMetaReadinessRow = z.infer<typeof deckMetaReadinessRowSchema>;

/**
 * `GET /api/decks/:deckId/meta-readiness` response. When the deck's format has no meta
 * and none was requested, `metaId`/`metaName` are empty and `rows` is empty (a graceful
 * no-meta state the UI renders without erroring).
 */
export const deckMetaReadinessResponseSchema = z.object({
  deckId: z.string(),
  metaId: z.string(),
  metaName: z.string(),
  rows: z.array(deckMetaReadinessRowSchema),
});
export type DeckMetaReadinessResponse = z.infer<typeof deckMetaReadinessResponseSchema>;
