import { useQuery } from "@tanstack/react-query";
import { formatListSchema, type FormatList } from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The active team's game's formats via GET /api/formats. */
export function useFormats(teamId: string | undefined) {
  return useQuery<FormatList>({
    queryKey: teamId ? queryKeys.formats(teamId) : ["formats", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get("/formats", { teamId, schema: formatListSchema });
    },
    enabled: Boolean(teamId),
  });
}
