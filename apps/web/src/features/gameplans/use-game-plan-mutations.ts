import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateMatchupGamePlanInput,
  type MatchupGamePlan,
  matchupGamePlanSchema,
  type UpdateMatchupGamePlanInput,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** Require an active team before a mutation runs (pages only render one when present). */
function requireTeam(teamId: string | undefined): string {
  if (!teamId) {
    throw new Error("No active team.");
  }
  return teamId;
}

/** Write a game-plan (POST /api/game-plans); invalidates the team's game-plan lists. */
export function useCreateGamePlan(teamId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMatchupGamePlanInput) =>
      apiClient.post<MatchupGamePlan>("/game-plans", {
        teamId: requireTeam(teamId),
        body: input,
        schema: matchupGamePlanSchema,
      }),
    onSuccess: (plan) => invalidateGamePlan(queryClient, teamId, plan.id),
  });
}

/** Edit a game-plan in place (PATCH /api/game-plans/:gamePlanId). */
export function useUpdateGamePlan(teamId: string | undefined, gamePlanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMatchupGamePlanInput) =>
      apiClient.patch<MatchupGamePlan>(`/game-plans/${gamePlanId}`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: matchupGamePlanSchema,
      }),
    onSuccess: () => invalidateGamePlan(queryClient, teamId, gamePlanId),
  });
}

/** Archive a game-plan (DELETE /api/game-plans/:gamePlanId) — team-admin only server-side. */
export function useArchiveGamePlan(teamId: string | undefined, gamePlanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.delete<void>(`/game-plans/${gamePlanId}`, { teamId: requireTeam(teamId) }),
    onSuccess: () => invalidateGamePlan(queryClient, teamId, gamePlanId),
  });
}

function invalidateGamePlan(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
  gamePlanId: string,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: [teamId, "game-plans"] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.gamePlan(teamId, gamePlanId) });
}
