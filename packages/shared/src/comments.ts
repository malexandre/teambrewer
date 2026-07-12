import { z } from "zod";

import { subjectTypeSchema } from "./collaboration.js";

/**
 * Shared comment contracts (see docs/features/collaboration-core.md). Comments are
 * polymorphic and team-scoped: `teamId` and `authorId` are stamped server-side
 * from the verified context and are never accepted from the client, so the create
 * input omits them. Threading is single-level — a reply carries `parentCommentId`
 * pointing at a top-level comment; a reply to a reply is flattened onto the same
 * top-level parent server-side.
 */

/** The prose body of a comment. */
export const commentBodySchema = z
  .string()
  .trim()
  .min(1, "A comment cannot be empty.")
  .max(5000, "A comment must be at most 5000 characters.");

/**
 * Create-comment input. `subjectType`/`subjectId` address the subject
 * polymorphically and are validated server-side to reference an existing,
 * same-team subject; unknown keys (e.g. a spoofed `teamId`/`authorId`) are
 * stripped by Zod.
 */
export const createCommentSchema = z.object({
  subjectType: subjectTypeSchema,
  subjectId: z.string().min(1),
  body: commentBodySchema,
  parentCommentId: z.string().min(1).optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

/** Update-comment input: body only, `.strict()` so no other field can be changed. */
export const updateCommentSchema = z.object({ body: commentBodySchema }).strict();
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

/** Query parameters for `GET /api/comments` — the thread for one subject. */
export const commentThreadQuerySchema = z.object({
  subjectType: subjectTypeSchema,
  subjectId: z.string().min(1),
});
export type CommentThreadQuery = z.infer<typeof commentThreadQuerySchema>;

/** The author of a comment, denormalized for display (no cross-team leakage). */
export const commentAuthorSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
});
export type CommentAuthor = z.infer<typeof commentAuthorSchema>;

/**
 * A single comment node. `archivedAt` non-null marks a soft-deleted comment; its
 * `body` is blanked server-side but it is kept so the thread structure survives
 * (the UI renders it as "removed").
 */
const commentNodeShape = {
  id: z.string(),
  subjectType: subjectTypeSchema,
  subjectId: z.string(),
  author: commentAuthorSchema,
  body: z.string(),
  parentCommentId: z.string().nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
};

/**
 * A comment with its (single level of) replies. Replies are returned oldest-first
 * within a top-level comment; top-level comments are ordered oldest-first too.
 */
export const commentSchema = z.object({
  ...commentNodeShape,
  replies: z.array(z.object(commentNodeShape)),
});
export type Comment = z.infer<typeof commentSchema>;

/** Threaded response for `GET /api/comments` (top-level comments, each with replies). */
export const commentThreadResponseSchema = z.object({ data: z.array(commentSchema) });
export type CommentThreadResponse = z.infer<typeof commentThreadResponseSchema>;
