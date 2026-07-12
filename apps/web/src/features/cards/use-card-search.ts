import { useQuery } from "@tanstack/react-query";
import { cardSearchResponseSchema, type CardSearchResponse } from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export interface CardSearchParams {
  query?: string;
  pitch?: number;
}

/**
 * Card search/autocomplete for the active team's game via GET /api/cards. Keyed
 * and scoped by `teamId` (sent as `X-Team-Id`), so results are always the active
 * team's game and switching teams refetches. `enabled` lets the picker gate the
 * request on a (debounced) query.
 */
export function useCardSearch(
  teamId: string | undefined,
  params: CardSearchParams,
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && Boolean(teamId);
  return useQuery<CardSearchResponse>({
    queryKey: teamId ? queryKeys.cardSearch(teamId, params) : ["cards", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      const search = new URLSearchParams();
      if (params.query) {
        search.set("query", params.query);
      }
      if (params.pitch !== undefined) {
        search.set("pitch", String(params.pitch));
      }
      const queryString = search.toString();
      return apiClient.get(`/cards${queryString ? `?${queryString}` : ""}`, {
        teamId,
        schema: cardSearchResponseSchema,
      });
    },
    enabled,
  });
}
