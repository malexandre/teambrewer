import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreatePollInput,
  type Poll,
  pollSchema,
  type UpdatePollInput,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

function requireTeam(teamId: string | undefined): string {
  if (!teamId) {
    throw new Error("No active team.");
  }
  return teamId;
}

/** Create a poll (POST /api/polls); invalidates the team's poll lists. */
export function useCreatePoll(teamId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePollInput) =>
      apiClient.post<Poll>("/polls", {
        teamId: requireTeam(teamId),
        body: input,
        schema: pollSchema,
      }),
    onSuccess: (poll) => invalidatePoll(queryClient, teamId, poll.id),
  });
}

/** Edit/close/reopen a poll (PATCH /api/polls/:pollId). */
export function useUpdatePoll(teamId: string | undefined, pollId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePollInput) =>
      apiClient.patch<Poll>(`/polls/${pollId}`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: pollSchema,
      }),
    onSuccess: () => invalidatePoll(queryClient, teamId, pollId),
  });
}

/** Cast/change the caller's vote (PUT /api/polls/:pollId/vote). */
export function useCastVote(teamId: string | undefined, pollId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (optionId: string) =>
      apiClient.put<Poll>(`/polls/${pollId}/vote`, {
        teamId: requireTeam(teamId),
        body: { optionId },
        schema: pollSchema,
      }),
    onSuccess: () => invalidatePoll(queryClient, teamId, pollId),
  });
}

/** Retract the caller's vote (DELETE /api/polls/:pollId/vote). */
export function useRetractVote(teamId: string | undefined, pollId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.delete<Poll>(`/polls/${pollId}/vote`, { teamId: requireTeam(teamId) }),
    onSuccess: () => invalidatePoll(queryClient, teamId, pollId),
  });
}

function invalidatePoll(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
  pollId: string,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: [teamId, "polls"] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.poll(teamId, pollId) });
}
