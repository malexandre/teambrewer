import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type Comment,
  commentSchema,
  type CommentThreadResponse,
  commentThreadResponseSchema,
  type CreateCommentInput,
  type SubjectType,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

function requireTeam(teamId: string | undefined): string {
  if (!teamId) {
    throw new Error("No active team.");
  }
  return teamId;
}

function toQueryString(subjectType: SubjectType, subjectId: string): string {
  const params = new URLSearchParams({ subjectType, subjectId });
  return `?${params.toString()}`;
}

/** The threaded comments for a subject, via GET /api/comments. */
export function useComments(
  teamId: string | undefined,
  subjectType: SubjectType,
  subjectId: string | undefined,
) {
  return useQuery<CommentThreadResponse>({
    queryKey:
      teamId && subjectId
        ? queryKeys.comments(teamId, subjectType, subjectId)
        : ["comments", "none"],
    queryFn: () => {
      if (!teamId || !subjectId) {
        throw new Error("No active team or subject.");
      }
      return apiClient.get(`/comments${toQueryString(subjectType, subjectId)}`, {
        teamId,
        schema: commentThreadResponseSchema,
      });
    },
    enabled: Boolean(teamId && subjectId),
  });
}

/**
 * Post a comment (or reply) on a subject; invalidates the subject's thread and
 * the team activity feed (commenting records activity).
 */
export function usePostComment(
  teamId: string | undefined,
  subjectType: SubjectType,
  subjectId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; parentCommentId?: string }) =>
      apiClient.post<Comment>("/comments", {
        teamId: requireTeam(teamId),
        body: {
          subjectType,
          subjectId,
          body: input.body,
          ...(input.parentCommentId ? { parentCommentId: input.parentCommentId } : {}),
        } satisfies CreateCommentInput,
        schema: commentSchema,
      }),
    onSuccess: () => invalidateThread(queryClient, teamId, subjectType, subjectId),
  });
}

/** Edit a comment's body (author or team-admin), via PATCH /api/comments/:commentId. */
export function useEditComment(
  teamId: string | undefined,
  subjectType: SubjectType,
  subjectId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { commentId: string; body: string }) =>
      apiClient.patch<Comment>(`/comments/${input.commentId}`, {
        teamId: requireTeam(teamId),
        body: { body: input.body },
        schema: commentSchema,
      }),
    onSuccess: () => invalidateThread(queryClient, teamId, subjectType, subjectId),
  });
}

/** Soft-delete a comment (author or team-admin), via DELETE /api/comments/:commentId. */
export function useDeleteComment(
  teamId: string | undefined,
  subjectType: SubjectType,
  subjectId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      apiClient.delete<void>(`/comments/${commentId}`, { teamId: requireTeam(teamId) }),
    onSuccess: () => invalidateThread(queryClient, teamId, subjectType, subjectId),
  });
}

function invalidateThread(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
  subjectType: SubjectType,
  subjectId: string,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({
    queryKey: queryKeys.comments(teamId, subjectType, subjectId),
  });
  void queryClient.invalidateQueries({ queryKey: [teamId, "activity"] });
}
