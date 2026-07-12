import { useQuery } from "@tanstack/react-query";
import {
  type DashboardMeResponse,
  dashboardMeResponseSchema,
  type DashboardTeamResponse,
  dashboardTeamResponseSchema,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The caller's personal overview for the active team, via GET /api/dashboard/me. */
export function useDashboardMe(teamId: string | undefined) {
  return useQuery<DashboardMeResponse>({
    queryKey: teamId ? queryKeys.dashboardMe(teamId) : ["dashboard-me", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get("/dashboard/me", { teamId, schema: dashboardMeResponseSchema });
    },
    enabled: Boolean(teamId),
  });
}

/**
 * The active team's overview for a target event (an explicit `eventId`, else the
 * nearest upcoming), via GET /api/dashboard/team.
 */
export function useDashboardTeam(teamId: string | undefined, eventId?: string) {
  const filters: Record<string, string> = eventId ? { eventId } : {};
  return useQuery<DashboardTeamResponse>({
    queryKey: teamId ? queryKeys.dashboardTeam(teamId, filters) : ["dashboard-team", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      const query = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
      return apiClient.get(`/dashboard/team${query}`, {
        teamId,
        schema: dashboardTeamResponseSchema,
      });
    },
    enabled: Boolean(teamId),
  });
}
