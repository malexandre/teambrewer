import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateGameLogInput,
  type GameLogDetail,
  gameLogDetailSchema,
  type UpdateGameLogInput,
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

/** Log a game (POST /api/game-logs); invalidates the team's game-log lists. */
export function useCreateGame(teamId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGameLogInput) =>
      apiClient.post<GameLogDetail>("/game-logs", {
        teamId: requireTeam(teamId),
        body: input,
        schema: gameLogDetailSchema,
      }),
    onSuccess: () => {
      if (teamId) void queryClient.invalidateQueries({ queryKey: [teamId, "games"] });
    },
  });
}

/** Edit a game log (PATCH /api/game-logs/:gameLogId); re-derives the weight if factors change. */
export function useUpdateGame(teamId: string | undefined, gameLogId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateGameLogInput) =>
      apiClient.patch<GameLogDetail>(`/game-logs/${gameLogId}`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: gameLogDetailSchema,
      }),
    onSuccess: () => invalidateGame(queryClient, teamId, gameLogId),
  });
}

/** Archive a game log (DELETE /api/game-logs/:gameLogId). */
export function useArchiveGame(teamId: string | undefined, gameLogId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.delete<void>(`/game-logs/${gameLogId}`, { teamId: requireTeam(teamId) }),
    onSuccess: () => invalidateGame(queryClient, teamId, gameLogId),
  });
}

function invalidateGame(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
  gameLogId: string,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: [teamId, "games"] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.game(teamId, gameLogId) });
}
