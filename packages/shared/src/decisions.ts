import { z } from "zod";

import { subjectTypeSchema } from "./collaboration.js";

/**
 * Shared decision-log contracts (see docs/features/team-knowledge.md). A **Decision**
 * is a structured record of what the team settled on and *why*: the **context** (the
 * situation/question), the **decision** (what was chosen), and the **rationale** (why).
 * The log is append-oriented — superseding a decision is a *new* decision that links
 * back to the old one via `relatedSubjectRef`, not an in-place rewrite.
 *
 * `relatedSubjectRef` optionally points at the subject a decision concerns (a deck,
 * event, primer, another decision, …), reusing the collaboration subsystem's
 * polymorphic `(subjectType, subjectId)` addressing. It is validated server-side to
 * reference a same-team subject.
 *
 * Tenancy: `teamId` and `authorId` are stamped server-side from the verified request
 * context; create/update inputs omit them and unknown keys are stripped.
 */

// --- Field schemas ----------------------------------------------------------

/** A decision's title. */
export const decisionTitleSchema = z
  .string()
  .trim()
  .min(1, "A decision title is required.")
  .max(200, "A decision title must be at most 200 characters.");

/** The situation or question a decision addresses. */
export const decisionContextSchema = z
  .string()
  .trim()
  .min(1, "A decision needs its context.")
  .max(10000, "The context must be at most 10000 characters.");

/** What was chosen. */
export const decisionOutcomeSchema = z
  .string()
  .trim()
  .min(1, "A decision needs its outcome.")
  .max(10000, "The decision must be at most 10000 characters.");

/** Why it was chosen. */
export const decisionRationaleSchema = z
  .string()
  .trim()
  .min(1, "A decision needs its rationale.")
  .max(10000, "The rationale must be at most 10000 characters.");

/**
 * A polymorphic reference to the subject a decision concerns, addressed exactly like a
 * collaboration subject. Validated server-side to resolve within the team (→ 404
 * otherwise, so a cross-team ref cannot leak).
 */
export const relatedSubjectRefSchema = z.object({
  subjectType: subjectTypeSchema,
  subjectId: z.string().min(1),
});
export type RelatedSubjectRef = z.infer<typeof relatedSubjectRefSchema>;

// --- Inputs -----------------------------------------------------------------

/**
 * Create-decision input. `title`, `context`, `decision`, and `rationale` are required.
 * `relatedSubjectRef` is optional and validated to a same-team subject. `decidedAt`
 * defaults to now server-side and is omitted here. `teamId`/`authorId` are
 * server-stamped; unknown keys are stripped.
 */
export const createDecisionSchema = z.object({
  title: decisionTitleSchema,
  context: decisionContextSchema,
  decision: decisionOutcomeSchema,
  rationale: decisionRationaleSchema,
  relatedSubjectRef: relatedSubjectRefSchema.optional(),
});
export type CreateDecisionInput = z.infer<typeof createDecisionSchema>;

/**
 * Update-decision input (author or team-admin corrections). Partial and `.strict()`.
 * `relatedSubjectRef: null` clears the reference; at least one field must change.
 */
export const updateDecisionSchema = z
  .object({
    title: decisionTitleSchema.optional(),
    context: decisionContextSchema.optional(),
    decision: decisionOutcomeSchema.optional(),
    rationale: decisionRationaleSchema.optional(),
    relatedSubjectRef: relatedSubjectRefSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  });
export type UpdateDecisionInput = z.infer<typeof updateDecisionSchema>;

/**
 * Query parameters for `GET /api/decisions`. Reverse-chronological by `decidedAt`;
 * `limit` is coerced from its string form.
 */
export const decisionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type DecisionListQuery = z.infer<typeof decisionListQuerySchema>;

// --- Response shapes --------------------------------------------------------

/** A teammate's display identity, denormalized onto decision rows. */
export const decisionAuthorSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
});
export type DecisionAuthor = z.infer<typeof decisionAuthorSchema>;

/**
 * A decision as returned by the API. `relatedSubjectRef` is exposed as its live ref
 * plus `relatedSubjectSnapshotLabel` — a human label resolved server-side at write time
 * that survives changes to the referenced subject.
 */
export const decisionSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  author: decisionAuthorSchema,
  title: z.string(),
  context: z.string(),
  decision: z.string(),
  rationale: z.string(),
  relatedSubjectRef: relatedSubjectRefSchema.nullable(),
  relatedSubjectSnapshotLabel: z.string().nullable(),
  decidedAt: z.string(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Decision = z.infer<typeof decisionSchema>;

/** Cursor-paginated response for `GET /api/decisions`. */
export const decisionListResponseSchema = z.object({
  data: z.array(decisionSchema),
  nextCursor: z.string().nullable(),
});
export type DecisionListResponse = z.infer<typeof decisionListResponseSchema>;
