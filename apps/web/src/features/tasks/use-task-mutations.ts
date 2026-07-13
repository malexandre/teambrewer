import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateTaskInput,
  type Task,
  taskSchema,
  type UpdateTaskInput,
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

/** Create a task (POST /api/tasks); invalidates the team's task lists. */
export function useCreateTask(teamId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      apiClient.post<Task>("/tasks", {
        teamId: requireTeam(teamId),
        body: input,
        schema: taskSchema,
      }),
    onSuccess: () => invalidateTasks(queryClient, teamId),
  });
}

/** Update / advance a task (PATCH /api/tasks/:taskId). */
export function useUpdateTask(teamId: string | undefined, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTaskInput) =>
      apiClient.patch<Task>(`/tasks/${taskId}`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: taskSchema,
      }),
    onSuccess: () => invalidateTasks(queryClient, teamId, taskId),
  });
}

/** Archive a task (DELETE /api/tasks/:taskId). */
export function useArchiveTask(teamId: string | undefined, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<void>(`/tasks/${taskId}`, { teamId: requireTeam(teamId) }),
    onSuccess: () => invalidateTasks(queryClient, teamId, taskId),
  });
}

/** Cast / retract my upvote (PUT / DELETE .../votes/me); invalidates the team's lists. */
export function useToggleTaskVote(teamId: string | undefined, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (hasVoted: boolean): Promise<void> => {
      if (hasVoted) {
        await apiClient.delete<void>(`/tasks/${taskId}/votes/me`, {
          teamId: requireTeam(teamId),
        });
      } else {
        await apiClient.put<Task>(`/tasks/${taskId}/votes/me`, {
          teamId: requireTeam(teamId),
          schema: taskSchema,
        });
      }
    },
    onSuccess: () => invalidateTasks(queryClient, teamId, taskId),
  });
}

function invalidateTasks(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
  taskId?: string,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: [teamId, "tasks"] });
  if (taskId) void queryClient.invalidateQueries({ queryKey: queryKeys.task(teamId, taskId) });
}
