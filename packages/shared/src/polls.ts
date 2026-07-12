import { z } from "zod";

/**
 * Shared poll contracts (see docs/features/team-knowledge.md). A **Poll** makes a group
 * choice explicit and fair (e.g. "which deck for Nationals?"): a `question`, at least
 * two ordered `options`, an optional `closesAt`, and an `open`/`closed` status. Each
 * member casts one `PollVote` (single-choice; re-voting updates the existing vote).
 *
 * A poll is effectively closed once `closesAt` passes even if its stored status is still
 * `open`; the server derives the effective status for voting and results. Game-agnostic:
 * nothing here hard-codes a game's concepts.
 *
 * Tenancy: `teamId` and `authorId` are stamped server-side from the verified request
 * context; inputs omit them and unknown keys are stripped.
 */

// --- Status lifecycle -------------------------------------------------------

/** Whether a poll accepts votes (`open`) or is settled (`closed`). */
export const pollStatusSchema = z.enum(["open", "closed"]);
export type PollStatus = z.infer<typeof pollStatusSchema>;

/**
 * The poll status lifecycle as data (docs/features/team-knowledge.md): an open poll may
 * be closed; a closed poll may be reopened (the service additionally forbids reopening a
 * poll whose `closesAt` has passed). Single source of truth shared by the API validator
 * and the web control; a no-op (same status) is never a valid transition.
 */
export const pollStatusTransitions: Record<PollStatus, readonly PollStatus[]> = {
  open: ["closed"],
  closed: ["open"],
};

/** The statuses a poll may move to from `from` (never itself). */
export function allowedNextPollStatuses(from: PollStatus): PollStatus[] {
  return [...pollStatusTransitions[from]];
}

/** Whether a poll status transition is permitted by the lifecycle. */
export function isPollStatusTransitionAllowed(from: PollStatus, to: PollStatus): boolean {
  return pollStatusTransitions[from].includes(to);
}

// --- Field schemas ----------------------------------------------------------

/** The question a poll asks. */
export const pollQuestionSchema = z
  .string()
  .trim()
  .min(1, "A poll question is required.")
  .max(300, "A poll question must be at most 300 characters.");

/** A single option's label. */
export const pollOptionLabelSchema = z
  .string()
  .trim()
  .min(1, "An option label is required.")
  .max(120, "An option label must be at most 120 characters.");

/**
 * The option labels supplied when creating (or replacing) a poll's options. At least two
 * are required and the labels must be distinct; the server assigns each a stable id.
 */
export const pollOptionLabelsSchema = z
  .array(pollOptionLabelSchema)
  .min(2, "A poll needs at least two options.")
  .max(20, "A poll can have at most 20 options.")
  .refine((labels) => new Set(labels).size === labels.length, {
    message: "Poll options must be distinct.",
  });

/**
 * The optional close date/time. Accepts any string a `Date` can parse; the service
 * rejects a `closesAt` already in the past on create (→ 422). Kept structural here so
 * schema validation stays free of wall-clock dependence.
 */
export const pollClosesAtSchema = z
  .string()
  .refine((value) => value.trim().length > 0 && !Number.isNaN(Date.parse(value)), {
    message: "A valid close date/time is required.",
  });

// --- Inputs -----------------------------------------------------------------

/**
 * Create-poll input. `teamId`/`authorId`/`status` are server-controlled and omitted
 * (status starts `open`); the server assigns each option a stable id. Unknown keys are
 * stripped.
 */
export const createPollSchema = z.object({
  question: pollQuestionSchema,
  options: pollOptionLabelsSchema,
  closesAt: pollClosesAtSchema.optional(),
});
export type CreatePollInput = z.infer<typeof createPollSchema>;

/**
 * Update-poll input (author or team-admin). Partial and `.strict()`. `status` drives
 * close/reopen (the service validates the transition). Replacing `options` is only
 * allowed while the poll has no votes (else 422). `closesAt: null` clears the deadline;
 * at least one field must change.
 */
export const updatePollSchema = z
  .object({
    question: pollQuestionSchema.optional(),
    options: pollOptionLabelsSchema.optional(),
    closesAt: pollClosesAtSchema.nullable().optional(),
    status: pollStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  });
export type UpdatePollInput = z.infer<typeof updatePollSchema>;

/** Cast/change the caller's vote: the chosen option's id. */
export const pollVoteSchema = z.object({ optionId: z.string().min(1, "An option is required.") });
export type PollVoteInput = z.infer<typeof pollVoteSchema>;

/**
 * Query parameters for `GET /api/polls`. `status` filters by effective status (a poll
 * past `closesAt` counts as closed); `limit` is coerced from its string form.
 */
export const pollListQuerySchema = z.object({
  status: pollStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type PollListQuery = z.infer<typeof pollListQuerySchema>;

// --- Response shapes --------------------------------------------------------

/** A teammate's display identity, denormalized onto poll rows. */
export const pollAuthorSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
});
export type PollAuthor = z.infer<typeof pollAuthorSchema>;

/** One ordered poll option. */
export const pollOptionSchema = z.object({ id: z.string(), label: z.string() });
export type PollOption = z.infer<typeof pollOptionSchema>;

/** The tally for one option. */
export const pollOptionResultSchema = z.object({
  optionId: z.string(),
  label: z.string(),
  count: z.number().int(),
  /** Whole-number percentage of the total votes (0 when there are no votes). */
  percentage: z.number().int(),
});
export type PollOptionResult = z.infer<typeof pollOptionResultSchema>;

/**
 * A poll as returned by the API, including its live tally and the caller's current vote.
 * `status` is the *effective* status (closed once `closesAt` passes).
 */
export const pollSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  author: pollAuthorSchema,
  question: z.string(),
  options: z.array(pollOptionSchema),
  status: pollStatusSchema,
  closesAt: z.string().nullable(),
  results: z.array(pollOptionResultSchema),
  totalVotes: z.number().int(),
  myVoteOptionId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Poll = z.infer<typeof pollSchema>;

/** Cursor-paginated response for `GET /api/polls`. */
export const pollListResponseSchema = z.object({
  data: z.array(pollSchema),
  nextCursor: z.string().nullable(),
});
export type PollListResponse = z.infer<typeof pollListResponseSchema>;
