import { useQuery } from "@tanstack/react-query";
import { type PollListResponse, pollListResponseSchema } from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The filters the poll list supports. */
export interface PollFilters {
  status?: "open" | "closed";
}

function toKeyFilters(filters: PollFilters): Record<string, string> {
  return filters.status ? { status: filters.status } : {};
}

function toQueryString(filters: PollFilters): string {
  return filters.status ? `?status=${filters.status}` : "";
}

/** The active team's polls (filtered by effective status), via GET /api/polls. */
export function usePolls(teamId: string | undefined, filters: PollFilters = {}) {
  return useQuery<PollListResponse>({
    queryKey: teamId ? queryKeys.polls(teamId, toKeyFilters(filters)) : ["polls", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/polls${toQueryString(filters)}`, {
        teamId,
        schema: pollListResponseSchema,
      });
    },
    enabled: Boolean(teamId),
  });
}
