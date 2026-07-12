import { z } from "zod";

/**
 * Shared retrospective contracts (see docs/features/gameplans-and-deck-selection.md
 * §Retrospective, docs/domain/playtesting-methodology.md §6). A **Retrospective** is
 * the post-event review: a required `body`, plus optional `resultsSummary` (how the
 * team did) and `learnings` (what feeds the next event). There is one retrospective
 * per event (the shared team review); any member authors, team-admins edit/archive.
 *
 * Tenancy: `teamId`, `eventId`, and `authorId` are server-stamped from the verified
 * context and the route, never the body; unknown keys are stripped.
 */

/** The main review write-up (required). Rendered as pre-wrapped text in the UI. */
export const retrospectiveBodySchema = z
  .string()
  .trim()
  .min(1, "A retrospective needs a body.")
  .max(20000, "The retrospective body must be at most 20000 characters.");

/** How the team placed / performed (optional but encouraged). */
export const retrospectiveResultsSummarySchema = z
  .string()
  .max(4000, "The results summary must be at most 4000 characters.");

/** What to carry into the next event (optional but encouraged). */
export const retrospectiveLearningsSchema = z
  .string()
  .max(8000, "The learnings must be at most 8000 characters.");

/**
 * Create-retrospective input for `POST /api/events/:eventId/retrospective`. `body` is
 * required; the two summary sections default to empty strings. A second create for the
 * same event is rejected (409) — there is one retrospective per event.
 */
export const createRetrospectiveSchema = z.object({
  body: retrospectiveBodySchema,
  resultsSummary: retrospectiveResultsSummarySchema.default(""),
  learnings: retrospectiveLearningsSchema.default(""),
});
export type CreateRetrospectiveInput = z.infer<typeof createRetrospectiveSchema>;

/**
 * Update-retrospective input. Partial and `.strict()`. `archived: true` soft-deletes
 * it (team-admin only, enforced server-side). At least one field must change.
 */
export const updateRetrospectiveSchema = z
  .object({
    body: retrospectiveBodySchema.optional(),
    resultsSummary: retrospectiveResultsSummarySchema.optional(),
    learnings: retrospectiveLearningsSchema.optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  });
export type UpdateRetrospectiveInput = z.infer<typeof updateRetrospectiveSchema>;

/** The retrospective's author display identity. */
export const retrospectiveAuthorSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
});
export type RetrospectiveAuthor = z.infer<typeof retrospectiveAuthorSchema>;

/** A retrospective as returned by the API. */
export const retrospectiveSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  author: retrospectiveAuthorSchema,
  body: z.string(),
  resultsSummary: z.string(),
  learnings: z.string(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Retrospective = z.infer<typeof retrospectiveSchema>;
