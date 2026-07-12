import { useQuery } from "@tanstack/react-query";
import { heroListSchema, type HeroList } from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The active team's game's heroes/identities via GET /api/heroes. */
export function useHeroes(teamId: string | undefined) {
  return useQuery<HeroList>({
    queryKey: teamId ? queryKeys.heroes(teamId) : ["heroes", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get("/heroes", { teamId, schema: heroListSchema });
    },
    enabled: Boolean(teamId),
  });
}
