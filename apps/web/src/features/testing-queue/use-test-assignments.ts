import { useQuery } from "@tanstack/react-query";
import {
  type TestAssignmentListResponse,
  testAssignmentListResponseSchema,
  type TestAssignmentStatus,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The filters the assignment list supports (a subset of the API query params). */
export interface TestAssignmentFilters {
  eventId?: string;
  assigneeId?: string;
  deckId?: string;
  status?: TestAssignmentStatus;
}

/** Reduce filters to a flat, serializable object for the query key. */
function toKeyFilters(filters: TestAssignmentFilters): Record<string, string> {
  const keyFilters: Record<string, string> = {};
  if (filters.eventId) keyFilters["eventId"] = filters.eventId;
  if (filters.assigneeId) keyFilters["assigneeId"] = filters.assigneeId;
  if (filters.deckId) keyFilters["deckId"] = filters.deckId;
  if (filters.status) keyFilters["status"] = filters.status;
  return keyFilters;
}

function toQueryString(filters: TestAssignmentFilters): string {
  const params = new URLSearchParams();
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters.deckId) params.set("deckId", filters.deckId);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The active team's test assignments (filtered), via GET /api/test-assignments. */
export function useTestAssignments(
  teamId: string | undefined,
  filters: TestAssignmentFilters = {},
) {
  return useQuery<TestAssignmentListResponse>({
    queryKey: teamId
      ? queryKeys.testAssignments(teamId, toKeyFilters(filters))
      : ["test-assignments", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/test-assignments${toQueryString(filters)}`, {
        teamId,
        schema: testAssignmentListResponseSchema,
      });
    },
    enabled: Boolean(teamId),
  });
}
