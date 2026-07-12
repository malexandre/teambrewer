import { z } from "zod";

/**
 * Shared primer contracts (see docs/features/team-knowledge.md). A **Primer** is a
 * long-form living document — a deck/matchup/format writeup — that turns accumulated
 * testing into readable, reusable team knowledge. `kind` classifies it; a
 * `deck_primer`/`matchup` primer may link a `relatedDeckId`.
 *
 * The body is authored as markdown source and rendered as pre-wrapped plain text in
 * the UI (the codebase convention through phase-09 — no markdown/sanitizer dependency;
 * React escapes text content, so rendering stays injection-safe). Game-agnostic:
 * nothing here hard-codes a game's cards, identity, or formats.
 *
 * Tenancy: `teamId` and `authorId` are stamped server-side from the verified request
 * context and are never accepted from the client, so create/update inputs omit them and
 * unknown keys are stripped.
 */

// --- Field schemas ----------------------------------------------------------

/** How a primer is classified. */
export const primerKindSchema = z.enum(["deck_primer", "matchup", "format_notes", "other"]);
export type PrimerKind = z.infer<typeof primerKindSchema>;

/** `team` = visible to all members; `private` = a personal draft (author + team-admins only). */
export const primerVisibilitySchema = z.enum(["team", "private"]);
export type PrimerVisibility = z.infer<typeof primerVisibilitySchema>;

/** A primer's title. */
export const primerTitleSchema = z
  .string()
  .trim()
  .min(1, "A primer title is required.")
  .max(200, "A primer title must be at most 200 characters.");

/** The primer body (markdown source, rendered as pre-wrapped text in the UI). */
export const primerBodySchema = z
  .string()
  .trim()
  .min(1, "A primer needs a body.")
  .max(50000, "The primer body must be at most 50000 characters.");

// --- Inputs -----------------------------------------------------------------

/**
 * Create-primer input. `title` and `kind` are required; `relatedDeckId` (when set) is
 * validated server-side to be a same-team deck. `teamId`/`authorId` are server-stamped
 * and omitted; unknown keys are stripped.
 */
export const createPrimerSchema = z.object({
  title: primerTitleSchema,
  kind: primerKindSchema,
  relatedDeckId: z.string().min(1).optional(),
  body: primerBodySchema,
  visibility: primerVisibilitySchema.default("team"),
});
export type CreatePrimerInput = z.infer<typeof createPrimerSchema>;

/**
 * Update-primer input. Partial and `.strict()`. `relatedDeckId: null` clears the deck
 * link; at least one field must change.
 */
export const updatePrimerSchema = z
  .object({
    title: primerTitleSchema.optional(),
    kind: primerKindSchema.optional(),
    relatedDeckId: z.string().min(1).nullable().optional(),
    body: primerBodySchema.optional(),
    visibility: primerVisibilitySchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  });
export type UpdatePrimerInput = z.infer<typeof updatePrimerSchema>;

/**
 * Query parameters for `GET /api/primers`. Values arrive as strings, so `limit` is
 * coerced. Archived primers and other members' private drafts are excluded server-side.
 */
export const primerListQuerySchema = z.object({
  kind: primerKindSchema.optional(),
  relatedDeckId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type PrimerListQuery = z.infer<typeof primerListQuerySchema>;

// --- Response shapes --------------------------------------------------------

/** A teammate's display identity, denormalized onto primer rows. */
export const primerAuthorSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
});
export type PrimerAuthor = z.infer<typeof primerAuthorSchema>;

/** A primer as returned in list responses (body omitted; see detail). */
export const primerSummarySchema = z.object({
  id: z.string(),
  authorId: z.string(),
  author: primerAuthorSchema,
  title: z.string(),
  kind: primerKindSchema,
  relatedDeckId: z.string().nullable(),
  relatedDeckName: z.string().nullable(),
  visibility: primerVisibilitySchema,
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PrimerSummary = z.infer<typeof primerSummarySchema>;

/** A single primer with its full detail (adds the markdown body). */
export const primerDetailSchema = primerSummarySchema.extend({ body: z.string() });
export type PrimerDetail = z.infer<typeof primerDetailSchema>;

/** Cursor-paginated response for `GET /api/primers`. */
export const primerListResponseSchema = z.object({
  data: z.array(primerSummarySchema),
  nextCursor: z.string().nullable(),
});
export type PrimerListResponse = z.infer<typeof primerListResponseSchema>;
