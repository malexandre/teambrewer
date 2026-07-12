import { useQuery } from "@tanstack/react-query";
import {
  type ActivityListResponse,
  activityListResponseSchema,
  type SubjectType,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** Filters for the activity feed (a subset of the API query params). */
export interface ActivityFilters {
  subjectType?: SubjectType;
  subjectId?: string;
}

function toKeyFilters(filters: ActivityFilters): Record<string, string> {
  const keyFilters: Record<string, string> = {};
  if (filters.subjectType) keyFilters["subjectType"] = filters.subjectType;
  if (filters.subjectId) keyFilters["subjectId"] = filters.subjectId;
  return keyFilters;
}

function toQueryString(filters: ActivityFilters): string {
  const params = new URLSearchParams();
  if (filters.subjectType) params.set("subjectType", filters.subjectType);
  if (filters.subjectId) params.set("subjectId", filters.subjectId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The team activity feed (optionally filtered by subject), via GET /api/activity. */
export function useActivity(teamId: string | undefined, filters: ActivityFilters = {}) {
  return useQuery<ActivityListResponse>({
    queryKey: teamId ? queryKeys.activity(teamId, toKeyFilters(filters)) : ["activity", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/activity${toQueryString(filters)}`, {
        teamId,
        schema: activityListResponseSchema,
      });
    },
    enabled: Boolean(teamId),
  });
}
