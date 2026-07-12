import { useQuery } from "@tanstack/react-query";
import { cardDataVersionSchema, type CardDataVersion } from "@teambrewer/shared";

import { ApiError, apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/**
 * Provenance of the active team's game's card data via GET /api/card-data/version
 * ("card data as of …"). Returns 404 before the game's first sync; that is a
 * normal empty state, not retried.
 */
export function useCardDataVersion(teamId: string | undefined) {
  return useQuery<CardDataVersion>({
    queryKey: teamId ? queryKeys.cardDataVersion(teamId) : ["card-data-version", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get("/card-data/version", { teamId, schema: cardDataVersionSchema });
    },
    enabled: Boolean(teamId),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 3,
  });
}
