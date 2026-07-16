import type { Comment, SubjectType } from "@teambrewer/shared";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { CardRichText } from "@/features/cards/CardRichText";
import { useActiveTeam } from "@/features/teams/active-team";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { MentionComposer } from "./MentionComposer";
import { useComments, useDeleteComment, useEditComment, usePostComment } from "./use-comments";

/** True when `commentId` names a comment (or a reply) present anywhere in the thread. */
function threadContainsComment(comments: Comment[], commentId: string): boolean {
  return comments.some(
    (comment) =>
      comment.id === commentId || comment.replies.some((reply) => reply.id === commentId),
  );
}

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
  previewCount,
  highlightCommentId,
}: {
  teamId: string | undefined;
  subjectType: SubjectType;
  subjectId: string;
  canComment: boolean;
  /**
   * When set, only the most recent `previewCount` top-level threads render, behind a
   * "Show N earlier comments" expander — keeping a feed of threads compact. Unset
   * (the default) renders the whole thread, so existing surfaces are unaffected.
   */
  previewCount?: number;
  /**
   * The comment a notification deep-link points at: scrolled into view and briefly
   * highlighted when it lives in this thread. Only the thread that owns the comment
   * reacts (comment ids are globally unique), so every thread on a page can be handed
   * the same value.
   */
  highlightCommentId?: string;
}) {
  const { data } = useComments(teamId, subjectType, subjectId);
  const postComment = usePostComment(teamId, subjectType, subjectId);
  const [showAllComments, setShowAllComments] = useState(false);

  const comments = data?.data ?? [];

  // A deep-linked comment may sit in the hidden `previewCount` slice; expand so it
  // renders (and can be scrolled to) rather than pointing at nothing.
  const targetIsInThread =
    highlightCommentId !== undefined && threadContainsComment(comments, highlightCommentId);
  useEffect(() => {
    if (targetIsInThread) {
      setShowAllComments(true);
    }
  }, [targetIsInThread]);
  const hiddenCount =
    previewCount !== undefined && !showAllComments
      ? Math.max(0, comments.length - previewCount)
      : 0;
  const visibleComments =
    hiddenCount > 0 ? comments.slice(comments.length - previewCount!) : comments;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Discussion</h3>

      {canComment ? (
        <MentionComposer
          teamId={teamId}
          submitLabel="Comment"
          placeholder="Add a comment… use @ to mention a teammate, + to link a card"
          ariaLabel="New comment"
          isPending={postComment.isPending}
          enableCardMentions
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

      {hiddenCount > 0 ? (
        <div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowAllComments(true)}>
            {`Show ${hiddenCount} earlier ${hiddenCount === 1 ? "comment" : "comments"}`}
          </Button>
        </div>
      ) : null}

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visibleComments.map((comment) => (
            <li key={comment.id}>
              <CommentItem
                teamId={teamId}
                subjectType={subjectType}
                subjectId={subjectId}
                comment={comment}
                canReply={canComment}
                highlightCommentId={highlightCommentId}
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
                        highlightCommentId={highlightCommentId}
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
  highlightCommentId,
}: {
  teamId: string | undefined;
  subjectType: SubjectType;
  subjectId: string;
  comment: Comment | Comment["replies"][number];
  canReply: boolean;
  highlightCommentId: string | undefined;
}) {
  const { data: user } = useCurrentUser();
  const { activeTeam } = useActiveTeam();
  const editComment = useEditComment(teamId, subjectType, subjectId);
  const deleteComment = useDeleteComment(teamId, subjectType, subjectId);
  const postComment = usePostComment(teamId, subjectType, subjectId);
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);

  // The deep-link target: a globally-unique DOM anchor (`comment-<id>`) plus a
  // scroll-to and a brief highlight that fades, so the source is obvious at a glance.
  const isHighlightTarget = comment.id === highlightCommentId;
  const containerRef = useRef<HTMLDivElement>(null);
  const [showHighlight, setShowHighlight] = useState(false);
  useEffect(() => {
    if (!isHighlightTarget) {
      return;
    }
    containerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    setShowHighlight(true);
    const timer = setTimeout(() => setShowHighlight(false), 2500);
    return () => clearTimeout(timer);
  }, [isHighlightTarget]);

  const anchorId = `comment-${comment.id}`;
  const isRemoved = comment.archivedAt !== null;
  const canModify =
    !isRemoved && (comment.author.userId === user?.id || activeTeam?.role === "team_admin");

  if (isRemoved) {
    return (
      <div
        ref={containerRef}
        id={anchorId}
        data-comment-id={comment.id}
        className={cn(
          "rounded-md border border-dashed border-border p-2 text-sm text-muted-foreground transition-colors duration-500",
          showHighlight && "bg-primary/10 ring-2 ring-primary",
        )}
      >
        Comment removed.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      id={anchorId}
      data-comment-id={comment.id}
      className={cn(
        "rounded-md border border-border p-2 transition-colors duration-500",
        showHighlight && "bg-primary/10 ring-2 ring-primary",
      )}
    >
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
          enableCardMentions
          onSubmit={(body) =>
            editComment.mutate(
              { commentId: comment.id, body },
              { onSuccess: () => setEditing(false) },
            )
          }
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="mt-1">
          <CardRichText
            teamId={teamId}
            body={comment.body}
            className="whitespace-pre-wrap text-sm"
          />
        </div>
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
            placeholder="Write a reply… use @ to mention a teammate, + to link a card"
            ariaLabel="Reply"
            isPending={postComment.isPending}
            enableCardMentions
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
