import type { Comment, SubjectType } from "@teambrewer/shared";
import { useState } from "react";

import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";
import { ApiError } from "@/lib/api-client";

import { MentionComposer } from "./MentionComposer";
import { useComments, useDeleteComment, useEditComment, usePostComment } from "./use-comments";

/**
 * The reusable, polymorphic comment thread dropped into any subject page
 * (docs/features/collaboration-core.md). Renders single-level threads with an
 * `@`-mention composer (team members only), inline edit/remove for the author or
 * a team-admin, and removed comments as tombstones so the structure survives.
 */
export function CommentThread({
  teamId,
  subjectType,
  subjectId,
  canComment,
}: {
  teamId: string | undefined;
  subjectType: SubjectType;
  subjectId: string;
  canComment: boolean;
}) {
  const { data } = useComments(teamId, subjectType, subjectId);
  const postComment = usePostComment(teamId, subjectType, subjectId);

  const comments = data?.data ?? [];

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Discussion</h3>

      {canComment ? (
        <MentionComposer
          teamId={teamId}
          submitLabel="Comment"
          placeholder="Add a comment… use @ to mention a teammate"
          ariaLabel="New comment"
          isPending={postComment.isPending}
          onSubmit={(body) => postComment.mutate({ body })}
        />
      ) : null}
      {postComment.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {postComment.error instanceof ApiError
            ? postComment.error.message
            : "Could not post comment."}
        </p>
      ) : null}

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id}>
              <CommentItem
                teamId={teamId}
                subjectType={subjectType}
                subjectId={subjectId}
                comment={comment}
                canReply={canComment}
              />
              {comment.replies.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-2 border-l border-border pl-4">
                  {comment.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentItem
                        teamId={teamId}
                        subjectType={subjectType}
                        subjectId={subjectId}
                        comment={reply}
                        canReply={false}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentItem({
  teamId,
  subjectType,
  subjectId,
  comment,
  canReply,
}: {
  teamId: string | undefined;
  subjectType: SubjectType;
  subjectId: string;
  comment: Comment | Comment["replies"][number];
  canReply: boolean;
}) {
  const { data: user } = useCurrentUser();
  const { activeTeam } = useActiveTeam();
  const editComment = useEditComment(teamId, subjectType, subjectId);
  const deleteComment = useDeleteComment(teamId, subjectType, subjectId);
  const postComment = usePostComment(teamId, subjectType, subjectId);
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);

  const isRemoved = comment.archivedAt !== null;
  const canModify =
    !isRemoved && (comment.author.userId === user?.id || activeTeam?.role === "team_admin");

  if (isRemoved) {
    return (
      <div className="rounded-md border border-dashed border-border p-2 text-sm text-muted-foreground">
        Comment removed.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{comment.author.displayName}</span>
        <span className="text-xs text-muted-foreground">
          {new Date(comment.createdAt).toLocaleString()}
        </span>
      </div>

      {editing ? (
        <MentionComposer
          teamId={teamId}
          initialValue={comment.body}
          submitLabel="Save"
          placeholder="Edit your comment…"
          ariaLabel="Edit comment"
          isPending={editComment.isPending}
          onSubmit={(body) =>
            editComment.mutate(
              { commentId: comment.id, body },
              { onSuccess: () => setEditing(false) },
            )
          }
          onCancel={() => setEditing(false)}
        />
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
      )}

      {!editing ? (
        <div className="mt-1 flex gap-2">
          {canReply ? (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setReplying((open) => !open)}
            >
              Reply
            </button>
          ) : null}
          {canModify ? (
            <>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-xs text-destructive hover:underline"
                onClick={() => deleteComment.mutate(comment.id)}
              >
                Remove
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {replying ? (
        <div className="mt-2">
          <MentionComposer
            teamId={teamId}
            submitLabel="Reply"
            placeholder="Write a reply… use @ to mention a teammate"
            ariaLabel="Reply"
            isPending={postComment.isPending}
            onSubmit={(body) =>
              postComment.mutate(
                { body, parentCommentId: comment.id },
                { onSuccess: () => setReplying(false) },
              )
            }
            onCancel={() => setReplying(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
