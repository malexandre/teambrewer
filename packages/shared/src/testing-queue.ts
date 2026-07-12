import { z } from "zod";

import { cardSummarySchema } from "./cards.js";
import { archetypeLabelSchema } from "./events.js";

/**
 * Shared testing-queue contracts (see docs/features/testing-queue.md,
 * docs/domain/playtesting-methodology.md §2/§4/§5). The testing queue turns loose
 * ideas and gaps into tracked work:
 *
 *  - **CardTestSuggestion** — a per-deck tech-card idea (a card to test, optionally
 *    over a card to cut) with reasoning and a guarded status lifecycle.
 *  - **SuggestionVote** — one upvote per member per suggestion (idempotent; the row's
 *    existence is the upvote, so there is no `value`).
 *  - **TestAssignment** — a specific matchup (our deck × an opponent target) handed to
 *    a member, so the field's bogeymen actually get piloted.
 *
 * Tenancy: `teamId`, `authorId`/`assignedById`, and the derived `opponentSnapshotLabel`
 * are stamped server-side from the verified request context and the referenced rows —
 * they are never accepted from the client, so create/update inputs omit them and
 * unknown keys are stripped. Game-agnostic: nothing here hard-codes a game's cards or
 * identity.
 */

// --- Status enums & lifecycles ----------------------------------------------

/** Where a card-test suggestion sits in its lifecycle. Transitions validated server-side. */
export const cardTestSuggestionStatusSchema = z.enum([
  "proposed",
  "testing",
  "adopted",
  "rejected",
]);
export type CardTestSuggestionStatus = z.infer<typeof cardTestSuggestionStatusSchema>;

/** Where a test assignment sits in its lifecycle. Transitions validated server-side. */
export const testAssignmentStatusSchema = z.enum(["open", "in_progress", "done", "cancelled"]);
export type TestAssignmentStatus = z.infer<typeof testAssignmentStatusSchema>;

/**
 * The card-test-suggestion lifecycle as data (docs/features/testing-queue.md):
 * `proposed → testing → adopted | rejected`, with a `proposed → rejected` dismissal
 * shortcut. `adopted` and `rejected` are terminal. Single source of truth shared by
 * the API validator and the web status control; a no-op (same status) is never valid.
 */
export const cardTestSuggestionStatusTransitions: Record<
  CardTestSuggestionStatus,
  readonly CardTestSuggestionStatus[]
> = {
  proposed: ["testing", "rejected"],
  testing: ["adopted", "rejected"],
  adopted: [],
  rejected: [],
};

/** The statuses a suggestion may move to from `from` (never itself). */
export function allowedNextCardTestSuggestionStatuses(
  from: CardTestSuggestionStatus,
): CardTestSuggestionStatus[] {
  return [...cardTestSuggestionStatusTransitions[from]];
}

/** Whether a suggestion status transition is permitted by the lifecycle. */
export function isCardTestSuggestionStatusTransitionAllowed(
  from: CardTestSuggestionStatus,
  to: CardTestSuggestionStatus,
): boolean {
  return cardTestSuggestionStatusTransitions[from].includes(to);
}

/**
 * Whether resolving a suggestion to `to` requires a resolution note. Moving to
 * `adopted` or `rejected` records a durable conclusion, so a note is mandatory
 * (docs/features/testing-queue.md §Card-test-suggestion lifecycle).
 */
export function cardTestSuggestionStatusRequiresResolutionNote(
  to: CardTestSuggestionStatus,
): boolean {
  return to === "adopted" || to === "rejected";
}

/**
 * The test-assignment lifecycle as data (docs/features/testing-queue.md):
 * `open → in_progress → done`, with a `cancelled` terminal reachable from `open` or
 * `in_progress`. `done` and `cancelled` are terminal. Single source of truth shared
 * by the API validator and the web status control; a no-op is never valid.
 */
export const testAssignmentStatusTransitions: Record<
  TestAssignmentStatus,
  readonly TestAssignmentStatus[]
> = {
  open: ["in_progress", "cancelled"],
  in_progress: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

/** The statuses an assignment may move to from `from` (never itself). */
export function allowedNextTestAssignmentStatuses(
  from: TestAssignmentStatus,
): TestAssignmentStatus[] {
  return [...testAssignmentStatusTransitions[from]];
}

/** Whether an assignment status transition is permitted by the lifecycle. */
export function isTestAssignmentStatusTransitionAllowed(
  from: TestAssignmentStatus,
  to: TestAssignmentStatus,
): boolean {
  return testAssignmentStatusTransitions[from].includes(to);
}

// --- Field schemas ----------------------------------------------------------

/** The rationale for a suggestion; required so ideas don't get lost without a "why". */
export const suggestionReasoningSchema = z
  .string()
  .trim()
  .min(1, "A reason for the suggestion is required.")
  .max(2000, "The reasoning must be at most 2000 characters.");

/**
 * The conclusion recorded when a suggestion is adopted or rejected. Structurally
 * optional (empty while unresolved); the server requires a non-empty value when the
 * status becomes `adopted`/`rejected`.
 */
export const resolutionNoteSchema = z
  .string()
  .trim()
  .max(2000, "The resolution note must be at most 2000 characters.");

/** Free-form notes on a test assignment. */
export const assignmentNotesSchema = z
  .string()
  .max(2000, "The notes must be at most 2000 characters.");

/** An optional soft goal for how many games to play for the assigned matchup. */
export const targetGamesSchema = z
  .number()
  .int("Target games must be a whole number.")
  .min(1, "Target games must be at least 1.")
  .max(1000, "Target games must be at most 1000.");

// --- Card-test-suggestion inputs --------------------------------------------

/**
 * Create-suggestion input. Omits every server-controlled field (`teamId`, `authorId`,
 * `status` starts at `proposed`, timestamps). `cardInId` is the card to test;
 * `cardOutId` is an optional card to cut (a straight add vs a swap) and must differ
 * from `cardInId`. Unknown keys are stripped.
 */
export const createCardTestSuggestionSchema = z
  .object({
    deckId: z.string().min(1, "A deck is required."),
    cardInId: z.string().min(1, "A card to test is required."),
    cardOutId: z.string().min(1).optional(),
    reasoning: suggestionReasoningSchema,
  })
  .refine((value) => value.cardOutId === undefined || value.cardOutId !== value.cardInId, {
    message: "The card to cut must differ from the card to test.",
    path: ["cardOutId"],
  });
export type CreateCardTestSuggestionInput = z.infer<typeof createCardTestSuggestionSchema>;

/**
 * Update-suggestion input. Partial and `.strict()`. `status` advances through this
 * same endpoint (the service validates the transition and the resolution-note rule);
 * `cardOutId: null` clears the swap. The `deckId` is immutable (a suggestion belongs
 * to one deck). The card-cut ≠ card-test rule is re-checked here when both are present
 * and again server-side against the merged row.
 */
export const updateCardTestSuggestionSchema = z
  .object({
    cardInId: z.string().min(1).optional(),
    cardOutId: z.string().min(1).nullable().optional(),
    reasoning: suggestionReasoningSchema.optional(),
    status: cardTestSuggestionStatusSchema.optional(),
    resolutionNote: resolutionNoteSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  })
  .refine(
    (value) =>
      value.cardInId === undefined ||
      value.cardOutId === undefined ||
      value.cardOutId === null ||
      value.cardOutId !== value.cardInId,
    { message: "The card to cut must differ from the card to test.", path: ["cardOutId"] },
  );
export type UpdateCardTestSuggestionInput = z.infer<typeof updateCardTestSuggestionSchema>;

/**
 * Query parameters for `GET /api/card-test-suggestions`. Values arrive as strings, so
 * `limit` is coerced. Archived suggestions are excluded server-side.
 */
export const cardTestSuggestionListQuerySchema = z.object({
  deckId: z.string().optional(),
  status: cardTestSuggestionStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type CardTestSuggestionListQuery = z.infer<typeof cardTestSuggestionListQuerySchema>;

// --- Test-assignment inputs -------------------------------------------------

/** The opponent target forms; exactly one must be provided on an assignment. */
const opponentTargetKeys = [
  "opponentGauntletEntryId",
  "opponentHeroId",
  "opponentArchetypeLabel",
] as const;

function countPresentOpponentTargets(value: {
  opponentGauntletEntryId?: unknown;
  opponentHeroId?: unknown;
  opponentArchetypeLabel?: unknown;
}): number {
  return opponentTargetKeys.filter((key) => value[key] !== undefined && value[key] !== null).length;
}

/**
 * Create-assignment input. Names exactly one opponent target form — a gauntlet entry,
 * a bare hero, or a free-text archetype label — plus the assignee and our deck.
 * `teamId`, `assignedById`, `status` (starts `open`), and the derived
 * `opponentSnapshotLabel` are server-stamped and omitted. Optional `eventId` scopes it
 * to an event's prep; optional `targetGames` sets a soft goal.
 */
export const createTestAssignmentSchema = z
  .object({
    assigneeId: z.string().min(1, "An assignee is required."),
    deckId: z.string().min(1, "A deck is required."),
    eventId: z.string().min(1).optional(),
    opponentGauntletEntryId: z.string().min(1).optional(),
    opponentHeroId: z.string().min(1).optional(),
    opponentArchetypeLabel: archetypeLabelSchema.optional(),
    targetGames: targetGamesSchema.optional(),
    notes: assignmentNotesSchema.default(""),
  })
  .refine((value) => countPresentOpponentTargets(value) === 1, {
    message:
      "An assignment must reference exactly one opponent target: a gauntlet entry, a hero, or an archetype label.",
  });
export type CreateTestAssignmentInput = z.infer<typeof createTestAssignmentSchema>;

/**
 * Update-assignment input. Partial and `.strict()`. The opponent target is immutable
 * once set (to change it, create a new assignment), so the schema rejects the target
 * keys. `status` advances through this same endpoint (the service validates the
 * transition); `targetGames: null` clears the goal.
 */
export const updateTestAssignmentSchema = z
  .object({
    assigneeId: z.string().min(1).optional(),
    targetGames: targetGamesSchema.nullable().optional(),
    notes: assignmentNotesSchema.optional(),
    status: testAssignmentStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  });
export type UpdateTestAssignmentInput = z.infer<typeof updateTestAssignmentSchema>;

/**
 * Query parameters for `GET /api/test-assignments`. Values arrive as strings, so
 * `limit` is coerced. Archived assignments are excluded server-side.
 */
export const testAssignmentListQuerySchema = z.object({
  eventId: z.string().optional(),
  assigneeId: z.string().optional(),
  deckId: z.string().optional(),
  status: testAssignmentStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type TestAssignmentListQuery = z.infer<typeof testAssignmentListQuerySchema>;

// --- Response shapes --------------------------------------------------------

/** A teammate's display identity, denormalized onto testing-queue rows. */
export const testingQueueUserSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
});
export type TestingQueueUser = z.infer<typeof testingQueueUserSchema>;

/**
 * A card-test suggestion as returned by the API. Suggestions are board-centric (there
 * is no detail endpoint), so this single shape carries everything the board needs:
 * the resolved in/out cards, the reasoning, the vote tally, and whether the requesting
 * member has upvoted.
 */
export const cardTestSuggestionSchema = z.object({
  id: z.string(),
  deckId: z.string(),
  author: testingQueueUserSchema,
  cardIn: cardSummarySchema,
  cardOut: cardSummarySchema.nullable(),
  reasoning: z.string(),
  status: cardTestSuggestionStatusSchema,
  resolutionNote: z.string(),
  voteCount: z.number().int(),
  viewerHasVoted: z.boolean(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CardTestSuggestion = z.infer<typeof cardTestSuggestionSchema>;

/** Cursor-paginated response for `GET /api/card-test-suggestions`. */
export const cardTestSuggestionListResponseSchema = z.object({
  data: z.array(cardTestSuggestionSchema),
  nextCursor: z.string().nullable(),
});
export type CardTestSuggestionListResponse = z.infer<typeof cardTestSuggestionListResponseSchema>;

/**
 * A test assignment as returned by the API. The opponent is exposed both as its live
 * reference ids (any may be null) and as `opponentSnapshotLabel` — a human label
 * resolved server-side at write time that survives deletion of a referenced gauntlet
 * entry or hero, so the assignment always reads e.g. "vs Fai".
 */
export const testAssignmentSchema = z.object({
  id: z.string(),
  eventId: z.string().nullable(),
  assignee: testingQueueUserSchema,
  assignedBy: testingQueueUserSchema,
  deckId: z.string(),
  deckName: z.string(),
  opponentGauntletEntryId: z.string().nullable(),
  opponentHeroId: z.string().nullable(),
  opponentArchetypeLabel: z.string().nullable(),
  opponentSnapshotLabel: z.string(),
  targetGames: z.number().int().nullable(),
  status: testAssignmentStatusSchema,
  notes: z.string(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TestAssignment = z.infer<typeof testAssignmentSchema>;

/** Cursor-paginated response for `GET /api/test-assignments`. */
export const testAssignmentListResponseSchema = z.object({
  data: z.array(testAssignmentSchema),
  nextCursor: z.string().nullable(),
});
export type TestAssignmentListResponse = z.infer<typeof testAssignmentListResponseSchema>;
