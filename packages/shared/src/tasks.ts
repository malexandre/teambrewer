import { z } from "zod";

/**
 * Shared task contracts (see docs/features/tasks.md). A **Task** is one free-form
 * unit of testing work — it merges the old CardTestSuggestion + TestAssignment
 * into a single model: a title + prose description (with inline `+[[cardId]]`
 * card tokens — see card-tokens.ts; no card FK table), an optional deck link,
 * upvotes, an assignee, and a guarded status lifecycle whose `finished` state
 * demands a report (mirroring the old resolution-note-on-resolve rule).
 *
 * Tenancy: `teamId` and `authorId` are stamped server-side from the verified
 * request context — they are never accepted from the client, so create/update
 * inputs omit them and unknown keys are stripped.
 */

// --- Status enum & lifecycle ------------------------------------------------

/** Where a task sits in its lifecycle. Transitions are validated server-side. */
export const taskStatusSchema = z.enum(["proposed", "assigned", "finished", "abandoned"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/**
 * The task lifecycle as data (docs/features/tasks.md):
 * `proposed → [assigned, abandoned]`, `assigned → [finished, abandoned]`;
 * `finished` and `abandoned` are terminal. Single source of truth shared by the
 * API validator and the web status control; a no-op (same status) is never valid.
 */
export const taskStatusTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  proposed: ["assigned", "abandoned"],
  assigned: ["finished", "abandoned"],
  finished: [],
  abandoned: [],
};

/** The statuses a task may move to from `from` (never itself). */
export function allowedNextTaskStatuses(from: TaskStatus): TaskStatus[] {
  return [...taskStatusTransitions[from]];
}

/** Whether a task status transition is permitted by the lifecycle. */
export function isTaskStatusTransitionAllowed(from: TaskStatus, to: TaskStatus): boolean {
  return taskStatusTransitions[from].includes(to);
}

/**
 * Whether moving a task to `to` requires a non-empty report. Finishing a task
 * records a durable conclusion, so a report is mandatory (mirrors the old
 * resolution-note-on-resolve rule for card-test suggestions).
 */
export function taskStatusRequiresReport(to: TaskStatus): boolean {
  return to === "finished";
}

// --- Field schemas ----------------------------------------------------------

/** A task's short title. */
export const taskTitleSchema = z
  .string()
  .trim()
  .min(1, "A task title is required.")
  .max(200, "A task title must be at most 200 characters.");

/**
 * A task's prose description. May embed inline `+[[cardId]]` card tokens (see
 * card-tokens.ts); the tokens are stored verbatim in the body and resolved to
 * card chips at render time. Structurally optional (empty by default).
 */
export const taskDescriptionSchema = z
  .string()
  .max(20000, "The description must be at most 20000 characters.");

/**
 * The conclusion recorded when a task is finished. Structurally optional (empty
 * while unfinished); the server requires a non-empty value when the status
 * becomes `finished`.
 */
export const taskReportSchema = z
  .string()
  .trim()
  .max(20000, "The report must be at most 20000 characters.");

// --- Inputs -----------------------------------------------------------------

/**
 * Create-task input. Omits every server-controlled field (`teamId`, `authorId`,
 * `status` starts at `proposed`, `report`, timestamps). An optional `deckId`
 * links the task to a deck; an optional `assigneeId` assigns it on creation.
 */
export const createTaskSchema = z.object({
  title: taskTitleSchema,
  description: taskDescriptionSchema.default(""),
  deckId: z.string().min(1).optional(),
  assigneeId: z.string().min(1).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * Update-task input. Partial and `.strict()`. `status` advances through this same
 * endpoint (the service validates the transition and the report-on-finish rule).
 * `deckId: null` clears the deck link; `assigneeId: null` unassigns.
 */
export const updateTaskSchema = z
  .object({
    title: taskTitleSchema.optional(),
    description: taskDescriptionSchema.optional(),
    deckId: z.string().min(1).nullable().optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    status: taskStatusSchema.optional(),
    report: taskReportSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/**
 * Query parameters for `GET /api/tasks`. Values arrive as strings, so `limit` is
 * coerced. Archived tasks are excluded server-side.
 */
export const taskListQuerySchema = z.object({
  deckId: z.string().optional(),
  assigneeId: z.string().optional(),
  status: taskStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

// --- Response shapes --------------------------------------------------------

/** A teammate's display identity, denormalized onto task rows. */
export const taskUserSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
});
export type TaskUser = z.infer<typeof taskUserSchema>;

/**
 * A task as returned by the API. The optional deck link is exposed as both its id
 * and a denormalized name; the assignee is null when unassigned. `voteCount` and
 * `viewerHasVoted` carry the upvote tally for the requesting member.
 */
export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  deckId: z.string().nullable(),
  deckName: z.string().nullable(),
  author: taskUserSchema,
  assignee: taskUserSchema.nullable(),
  status: taskStatusSchema,
  report: z.string(),
  voteCount: z.number().int(),
  viewerHasVoted: z.boolean(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof taskSchema>;

/** Cursor-paginated response for `GET /api/tasks`. */
export const taskListResponseSchema = z.object({
  data: z.array(taskSchema),
  nextCursor: z.string().nullable(),
});
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;
