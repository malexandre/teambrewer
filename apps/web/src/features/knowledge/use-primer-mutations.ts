import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreatePrimerInput,
  type PrimerDetail,
  primerDetailSchema,
  type UpdatePrimerInput,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

function requireTeam(teamId: string | undefined): string {
  if (!teamId) {
    throw new Error("No active team.");
  }
  return teamId;
}

/** Create a primer (POST /api/primers); invalidates the team's primer lists. */
export function useCreatePrimer(teamId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePrimerInput) =>
      apiClient.post<PrimerDetail>("/primers", {
        teamId: requireTeam(teamId),
        body: input,
        schema: primerDetailSchema,
      }),
    onSuccess: (primer) => invalidatePrimer(queryClient, teamId, primer.id),
  });
}

/** Edit a primer in place (PATCH /api/primers/:primerId). */
export function useUpdatePrimer(teamId: string | undefined, primerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePrimerInput) =>
      apiClient.patch<PrimerDetail>(`/primers/${primerId}`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: primerDetailSchema,
      }),
    onSuccess: () => invalidatePrimer(queryClient, teamId, primerId),
  });
}

/** Archive a primer (DELETE /api/primers/:primerId) — author or team-admin server-side. */
export function useArchivePrimer(teamId: string | undefined, primerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.delete<void>(`/primers/${primerId}`, { teamId: requireTeam(teamId) }),
    onSuccess: () => invalidatePrimer(queryClient, teamId, primerId),
  });
}

function invalidatePrimer(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
  primerId: string,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: [teamId, "primers"] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.primer(teamId, primerId) });
}
