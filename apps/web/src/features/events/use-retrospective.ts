import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreateRetrospectiveInput,
  type Retrospective,
  retrospectiveSchema,
  type UpdateRetrospectiveInput,
} from "@teambrewer/shared";

import { ApiError, apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** Require an active team before a mutation runs (pages only render one when present). */
function requireTeam(teamId: string | undefined): string {
  if (!teamId) {
    throw new Error("No active team.");
  }
  return teamId;
}

/**
 * The event's retrospective, via GET /api/events/:eventId/retrospective. A 404 (no
 * retrospective written yet) is a normal empty state, not a retryable error, so the
 * query does not retry it — the caller treats a 404 `ApiError` as "none yet".
 */
export function useEventRetrospective(teamId: string | undefined, eventId: string) {
  return useQuery<Retrospective>({
    queryKey: teamId
      ? queryKeys.eventRetrospective(teamId, eventId)
      : ["event", eventId, "retrospective", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/events/${eventId}/retrospective`, {
        teamId,
        schema: retrospectiveSchema,
      });
    },
    enabled: Boolean(teamId),
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 3,
  });
}

/** Write the event's retrospective (POST /api/events/:eventId/retrospective). */
export function useCreateRetrospective(teamId: string | undefined, eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRetrospectiveInput) =>
      apiClient.post<Retrospective>(`/events/${eventId}/retrospective`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: retrospectiveSchema,
      }),
    onSuccess: () => invalidate(queryClient, teamId, eventId),
  });
}

/** Edit / archive the event's retrospective (PATCH .../retrospective/:retrospectiveId). */
export function useUpdateRetrospective(
  teamId: string | undefined,
  eventId: string,
  retrospectiveId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRetrospectiveInput) =>
      apiClient.patch<Retrospective>(`/events/${eventId}/retrospective/${retrospectiveId}`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: retrospectiveSchema,
      }),
    onSuccess: () => invalidate(queryClient, teamId, eventId),
  });
}

function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
  eventId: string,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: queryKeys.eventRetrospective(teamId, eventId) });
}
