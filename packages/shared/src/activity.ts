import { z } from "zod";

import { subjectTypeSchema } from "./collaboration.js";

/**
 * Shared activity-feed contracts (see docs/features/collaboration-core.md). The
 * activity feed is an append-only, team-scoped timeline addressed polymorphically
 * by `(subjectType, subjectId)`. Verbs are an enum extended as modules adopt the
 * subsystem; phase-04 emits the deck lifecycle verbs plus the generic `commented`.
 */

export const activityVerbSchema = z.enum([
  "deck_created",
  "deck_updated",
  "deck_status_changed",
  "commented",
]);
export type ActivityVerb = z.infer<typeof activityVerbSchema>;

/** The teammate who performed the action. */
export const activityActorSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
});
export type ActivityActor = z.infer<typeof activityActorSchema>;

/**
 * Query parameters for `GET /api/activity`. With no filter it returns the whole
 * team feed; `subjectType`/`subjectId` narrow it to one subject. Cursor-paginated
 * newest-first.
 */
export const activityQuerySchema = z.object({
  subjectType: subjectTypeSchema.optional(),
  subjectId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

/** One entry of the team activity feed. */
export const activityEventSchema = z.object({
  id: z.string(),
  verb: activityVerbSchema,
  subjectType: subjectTypeSchema,
  subjectId: z.string(),
  actor: activityActorSchema,
  createdAt: z.string(),
});
export type ActivityEvent = z.infer<typeof activityEventSchema>;

/** Cursor-paginated response for `GET /api/activity`. */
export const activityListResponseSchema = z.object({
  data: z.array(activityEventSchema),
  nextCursor: z.string().nullable(),
});
export type ActivityListResponse = z.infer<typeof activityListResponseSchema>;
