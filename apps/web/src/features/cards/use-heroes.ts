import { useQuery } from "@tanstack/react-query";
import { heroListSchema, type HeroList } from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/**
 * The active team's game's heroes/identities via GET /api/heroes. An optional
 * `formatId` narrows the list to heroes legal in that format (coverage-aware
 * server-side); it is part of the query key so each format caches independently.
 */
export function useHeroes(teamId: string | undefined, formatId?: string) {
  return useQuery<HeroList>({
    queryKey: teamId ? queryKeys.heroes(teamId, formatId) : ["heroes", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      const query = formatId ? `?${new URLSearchParams({ formatId }).toString()}` : "";
      return apiClient.get(`/heroes${query}`, { teamId, schema: heroListSchema });
    },
    enabled: Boolean(teamId),
  });
}
