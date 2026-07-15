import { z } from "zod";

/**
 * Shared meta contracts (see docs/features/metas.md,
 * docs/decisions/0010-meta-as-organizing-hub.md). A **Meta** is the team's
 * lightweight organizing hub for a metagame window of a specific **format**: a
 * named, dated span (`[startDate, endDate]`) for one `formatId`, with a
 * description and a tiered opponent-deck list (the reshaped gauntlet — see
 * meta-deck-entries.ts). There is no "current meta": the list is ordered
 * newest-first (by `startDate` descending) and every former default resolves to
 * the most recent meta of the relevant format, server-side.
 *
 * Tenancy: `teamId` is stamped server-side from the verified request context —
 * it is never accepted from the client, so create/update inputs omit it and
 * unknown keys are stripped. `formatId` must name a format in the team's game
 * (validated server-side). Metas are a shared team board (like events): any
 * member creates/edits/deletes, so there is no owner field.
 */

/** A meta's display name. */
export const metaNameSchema = z
  .string()
  .trim()
  .min(1, "A meta name is required.")
  .max(120, "A meta name must be at most 120 characters.");

/** Optional free-form prose describing the meta. */
export const metaDescriptionSchema = z.string().max(5000);

/** The id of the format (in the team's game) this meta covers. Required on create. */
export const metaFormatIdSchema = z.string().min(1, "A format is required.");

/**
 * Why a new meta exists. A deliberately **FAB-flavored, optional** signal that drives the
 * list card's imagery (see docs/architecture/game-abstraction.md): a ban-list update, heroes
 * going Living Legend, or a new product release. Optional/nullable so games that don't share
 * these concepts simply leave it unset.
 */
export const metaChangeReasonSchema = z.enum(["ban_list", "living_legend", "product_release"]);
export type MetaChangeReason = z.infer<typeof metaChangeReasonSchema>;

/** The id of the hero (in the team's game) that went to Living Legend. */
export const metaChangeReasonHeroIdSchema = z.string().min(1, "A hero is required.");

/**
 * A user-pasted marketing-image URL for a product-release meta. Restricted to http(s) so it
 * satisfies the app's image CSP; we only ever reference the URL (never fetch/host it), keeping
 * the link-only, no-scraping data-source model.
 */
export const metaChangeReasonImageUrlSchema = z
  .url({ protocol: /^https?$/, error: "A valid http(s) image URL is required." })
  .max(2048, "The image URL is too long.");

/**
 * Whether the change-reason fields are internally consistent: a hero only qualifies a
 * `living_legend` meta and an image URL only a `product_release` meta. The service also
 * normalizes this authoritatively (clearing non-matching fields), so this is a tight-contract
 * guard, not the sole enforcement.
 */
function isChangeReasonConsistent(value: {
  changeReason?: MetaChangeReason | null | undefined;
  changeReasonHeroId?: string | null | undefined;
  changeReasonImageUrl?: string | null | undefined;
}): boolean {
  const reason = value.changeReason ?? null;
  if (value.changeReasonHeroId != null && reason !== "living_legend") {
    return false;
  }
  if (value.changeReasonImageUrl != null && reason !== "product_release") {
    return false;
  }
  return true;
}

/**
 * A meta window boundary. Accepts any string a `Date` can parse — a calendar
 * date (`2026-09-12`, from a native date input) or a full ISO datetime —
 * because a meta window is bounded by days, not precise instants. The service
 * normalizes it to a `Date`.
 */
export const metaDateSchema = z
  .string()
  .refine((value) => value.trim().length > 0 && !Number.isNaN(Date.parse(value)), {
    message: "A valid date is required.",
  });

/** Whether `endDate` is on or after `startDate` (a window cannot end before it starts). */
function isWindowOrdered(value: {
  startDate?: string | undefined;
  endDate?: string | undefined;
}): boolean {
  if (value.startDate === undefined || value.endDate === undefined) {
    return true;
  }
  return Date.parse(value.endDate) >= Date.parse(value.startDate);
}

/**
 * Create-meta input. Omits every server-controlled field (`teamId`, timestamps,
 * `archivedAt`). The window must be ordered (`endDate >= startDate`).
 */
export const createMetaSchema = z
  .object({
    name: metaNameSchema,
    formatId: metaFormatIdSchema,
    startDate: metaDateSchema,
    endDate: metaDateSchema,
    description: metaDescriptionSchema.default(""),
    changeReason: metaChangeReasonSchema.nullish(),
    changeReasonHeroId: metaChangeReasonHeroIdSchema.nullish(),
    changeReasonImageUrl: metaChangeReasonImageUrlSchema.nullish(),
  })
  .refine(isWindowOrdered, {
    message: "The end date must be on or after the start date.",
    path: ["endDate"],
  })
  .refine(isChangeReasonConsistent, {
    message: "The change-reason detail does not match the selected reason.",
    path: ["changeReason"],
  });
export type CreateMetaInput = z.infer<typeof createMetaSchema>;

/**
 * Update-meta input. Partial and `.strict()`. When both window boundaries are
 * present the ordering is re-checked here; the service also re-checks against
 * the merged row (one boundary changing must not cross the other).
 */
export const updateMetaSchema = z
  .object({
    name: metaNameSchema.optional(),
    formatId: metaFormatIdSchema.optional(),
    startDate: metaDateSchema.optional(),
    endDate: metaDateSchema.optional(),
    description: metaDescriptionSchema.optional(),
    changeReason: metaChangeReasonSchema.nullish(),
    changeReasonHeroId: metaChangeReasonHeroIdSchema.nullish(),
    changeReasonImageUrl: metaChangeReasonImageUrlSchema.nullish(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  })
  .refine(isWindowOrdered, {
    message: "The end date must be on or after the start date.",
    path: ["endDate"],
  })
  .refine(isChangeReasonConsistent, {
    message: "The change-reason detail does not match the selected reason.",
    path: ["changeReason"],
  });
export type UpdateMetaInput = z.infer<typeof updateMetaSchema>;

/**
 * Query parameters for `GET /api/metas`. Values arrive as strings, so `limit` is
 * coerced. Archived metas are excluded server-side.
 */
export const metaListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type MetaListQuery = z.infer<typeof metaListQuerySchema>;

/**
 * A meta as returned in list responses (description omitted; see detail).
 * `formatName` is the server-resolved display name of the meta's format.
 */
export const metaSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  formatId: z.string(),
  formatName: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Optional imagery signal for the list card (see metaChangeReasonSchema). The hero is resolved
  // client-side (via the heroes list) exactly like the meta board's hero squares.
  changeReason: metaChangeReasonSchema.nullable(),
  changeReasonHeroId: z.string().nullable(),
  changeReasonImageUrl: z.string().nullable(),
});
export type MetaSummary = z.infer<typeof metaSummarySchema>;

/** A single meta with its full detail (prose description). */
export const metaDetailSchema = metaSummarySchema.extend({
  description: z.string(),
});
export type MetaDetail = z.infer<typeof metaDetailSchema>;

/** Cursor-paginated response for `GET /api/metas`. */
export const metaListResponseSchema = z.object({
  data: z.array(metaSummarySchema),
  nextCursor: z.string().nullable(),
});
export type MetaListResponse = z.infer<typeof metaListResponseSchema>;
