import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CardTestSuggestion,
  cardTestSuggestionSchema,
  type CreateCardTestSuggestionInput,
  type UpdateCardTestSuggestionInput,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";

/** Require an active team before a mutation runs (pages only render one when present). */
function requireTeam(teamId: string | undefined): string {
  if (!teamId) {
    throw new Error("No active team.");
  }
  return teamId;
}

/** Propose a card test (POST /api/card-test-suggestions); invalidates the team's lists. */
export function useCreateSuggestion(teamId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCardTestSuggestionInput) =>
      apiClient.post<CardTestSuggestion>("/card-test-suggestions", {
        teamId: requireTeam(teamId),
        body: input,
        schema: cardTestSuggestionSchema,
      }),
    onSuccess: () => invalidateSuggestions(queryClient, teamId),
  });
}

/** Edit / transition a suggestion (PATCH /api/card-test-suggestions/:suggestionId). */
export function useUpdateSuggestion(teamId: string | undefined, suggestionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCardTestSuggestionInput) =>
      apiClient.patch<CardTestSuggestion>(`/card-test-suggestions/${suggestionId}`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: cardTestSuggestionSchema,
      }),
    onSuccess: () => invalidateSuggestions(queryClient, teamId),
  });
}

/** Archive a suggestion (DELETE /api/card-test-suggestions/:suggestionId). */
export function useArchiveSuggestion(teamId: string | undefined, suggestionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.delete<void>(`/card-test-suggestions/${suggestionId}`, {
        teamId: requireTeam(teamId),
      }),
    onSuccess: () => invalidateSuggestions(queryClient, teamId),
  });
}

/** Cast / retract my upvote (PUT / DELETE .../votes/me); invalidates the team's lists. */
export function useToggleVote(teamId: string | undefined, suggestionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (hasVoted: boolean): Promise<void> => {
      if (hasVoted) {
        await apiClient.delete<void>(`/card-test-suggestions/${suggestionId}/votes/me`, {
          teamId: requireTeam(teamId),
        });
      } else {
        await apiClient.put<CardTestSuggestion>(`/card-test-suggestions/${suggestionId}/votes/me`, {
          teamId: requireTeam(teamId),
          schema: cardTestSuggestionSchema,
        });
      }
    },
    onSuccess: () => invalidateSuggestions(queryClient, teamId),
  });
}

function invalidateSuggestions(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: [teamId, "card-test-suggestions"] });
}
