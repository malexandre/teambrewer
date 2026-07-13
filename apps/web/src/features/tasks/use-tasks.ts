import { useQuery } from "@tanstack/react-query";
import {
  type Task,
  type TaskListResponse,
  taskListResponseSchema,
  taskSchema,
  type TaskStatus,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The filters the task list supports (a subset of the API query params). */
export interface TaskFilters {
  deckId?: string;
  assigneeId?: string;
  status?: TaskStatus;
}

/** Reduce filters to a flat, serializable object for the query key. */
function toKeyFilters(filters: TaskFilters): Record<string, string> {
  const keyFilters: Record<string, string> = {};
  if (filters.deckId) keyFilters["deckId"] = filters.deckId;
  if (filters.assigneeId) keyFilters["assigneeId"] = filters.assigneeId;
  if (filters.status) keyFilters["status"] = filters.status;
  return keyFilters;
}

function toQueryString(filters: TaskFilters): string {
  const params = new URLSearchParams();
  if (filters.deckId) params.set("deckId", filters.deckId);
  if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters.status) params.set("status", filters.status);
  // Show the whole board in one page (statuses are grouped client-side).
  params.set("limit", "50");
  return `?${params.toString()}`;
}

/** The active team's tasks (filtered), via GET /api/tasks. */
export function useTasks(teamId: string | undefined, filters: TaskFilters = {}) {
  return useQuery<TaskListResponse>({
    queryKey: teamId ? queryKeys.tasks(teamId, toKeyFilters(filters)) : ["tasks", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/tasks${toQueryString(filters)}`, {
        teamId,
        schema: taskListResponseSchema,
      });
    },
    enabled: Boolean(teamId),
  });
}

/** A single task's detail, via GET /api/tasks/:taskId. */
export function useTask(teamId: string | undefined, taskId: string | undefined) {
  return useQuery<Task>({
    queryKey: teamId && taskId ? queryKeys.task(teamId, taskId) : ["task", "none"],
    queryFn: () => {
      if (!teamId || !taskId) {
        throw new Error("No active team or task.");
      }
      return apiClient.get(`/tasks/${taskId}`, { teamId, schema: taskSchema });
    },
    enabled: Boolean(teamId && taskId),
  });
}
