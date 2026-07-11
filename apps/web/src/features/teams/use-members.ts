import { useQuery } from "@tanstack/react-query";
import { teamMemberListSchema, type TeamMemberList } from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/**
 * Members of the active team via GET /api/members. The query key is scoped by
 * `teamId` and the request sends `X-Team-Id`, so switching teams both refetches
 * and can never surface another team's roster.
 */
export function useMembers(teamId: string | undefined) {
  return useQuery<TeamMemberList>({
    queryKey: teamId ? queryKeys.members(teamId) : ["members", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get("/members", { teamId, schema: teamMemberListSchema });
    },
    enabled: Boolean(teamId),
  });
}
