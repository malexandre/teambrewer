import { z } from "zod";

/**
 * Shared meta contracts (see docs/features/metas.md,
 * docs/decisions/0010-meta-as-organizing-hub.md). A **Meta** is the team's
 * lightweight organizing hub for a metagame window: a named, dated span
 * (`[startDate, endDate]`) with a description and a tiered opponent-deck list
 * (the reshaped gauntlet — see meta-deck-entries.ts). "Current meta" = the meta
 * whose window contains today (latest `startDate` wins on overlap); the
 * resolution is done server-side.
 *
 * Tenancy: `teamId` is stamped server-side from the verified request context —
 * it is never accepted from the client, so create/update inputs omit it and
 * unknown keys are stripped. Metas are a shared team board (like events): any
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
    startDate: metaDateSchema,
    endDate: metaDateSchema,
    description: metaDescriptionSchema.default(""),
  })
  .refine(isWindowOrdered, {
    message: "The end date must be on or after the start date.",
    path: ["endDate"],
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
    startDate: metaDateSchema.optional(),
    endDate: metaDateSchema.optional(),
    description: metaDescriptionSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  })
  .refine(isWindowOrdered, {
    message: "The end date must be on or after the start date.",
    path: ["endDate"],
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

/** A meta as returned in list responses (description omitted; see detail). */
export const metaSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
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
