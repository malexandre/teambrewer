import { useQuery } from "@tanstack/react-query";
import { myTeamsResponseSchema, type MyTeamsResponse } from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The teams the authenticated user belongs to (drives the active-team selector). */
export function useMyTeams() {
  return useQuery<MyTeamsResponse>({
    queryKey: queryKeys.myTeams(),
    queryFn: () => apiClient.get("/me/teams", { schema: myTeamsResponseSchema }),
    retry: false,
  });
}
