import { z } from "zod";

import { subjectTypeSchema } from "./collaboration.js";

/**
 * Shared notification contracts (see docs/features/collaboration-core.md).
 * Notifications are the recipient's in-app inbox — there is NO email or push
 * (ADR-0003). Each is team-scoped and further scoped to its `userId`; a user only
 * ever sees their own. `readAt` null means unread. In phase-04 the only type is
 * `mention`; the enum is left open so reply/authored-subject notifications can be
 * added later without a migration.
 */

export const notificationTypeSchema = z.enum(["mention"]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/** The teammate whose action produced the notification (null if system-generated). */
export const notificationActorSchema = z
  .object({
    userId: z.string(),
    username: z.string(),
    displayName: z.string(),
  })
  .nullable();
export type NotificationActor = z.infer<typeof notificationActorSchema>;

/** Query parameters for `GET /api/notifications`. */
export const notificationListQuerySchema = z.object({
  unreadOnly: z
    .union([z.literal("true"), z.literal("false")])
    .transform((value) => value === "true")
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

/** A single inbox item, deep-linking back to its subject. */
export const notificationSchema = z.object({
  id: z.string(),
  type: notificationTypeSchema,
  subjectType: subjectTypeSchema,
  subjectId: z.string(),
  commentId: z.string().nullable(),
  actor: notificationActorSchema,
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

/** Cursor-paginated response for `GET /api/notifications`, with the unread badge count. */
export const notificationListResponseSchema = z.object({
  data: z.array(notificationSchema),
  unreadCount: z.number().int(),
  nextCursor: z.string().nullable(),
});
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
