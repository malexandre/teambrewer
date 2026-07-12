import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateDecisionInput,
  type Decision,
  decisionSchema,
  type UpdateDecisionInput,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

function requireTeam(teamId: string | undefined): string {
  if (!teamId) {
    throw new Error("No active team.");
  }
  return teamId;
}

/** Record a decision (POST /api/decisions); invalidates the team's decisions log. */
export function useCreateDecision(teamId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDecisionInput) =>
      apiClient.post<Decision>("/decisions", {
        teamId: requireTeam(teamId),
        body: input,
        schema: decisionSchema,
      }),
    onSuccess: (decision) => invalidateDecision(queryClient, teamId, decision.id),
  });
}

/** Correct a decision in place (PATCH /api/decisions/:decisionId). */
export function useUpdateDecision(teamId: string | undefined, decisionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateDecisionInput) =>
      apiClient.patch<Decision>(`/decisions/${decisionId}`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: decisionSchema,
      }),
    onSuccess: () => invalidateDecision(queryClient, teamId, decisionId),
  });
}

function invalidateDecision(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
  decisionId: string,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: [teamId, "decisions"] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.decision(teamId, decisionId) });
}
