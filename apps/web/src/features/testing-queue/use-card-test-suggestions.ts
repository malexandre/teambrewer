import { useQuery } from "@tanstack/react-query";
import {
  type CardTestSuggestionListResponse,
  cardTestSuggestionListResponseSchema,
  type CardTestSuggestionStatus,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The filters the suggestion list supports (a subset of the API query params). */
export interface CardTestSuggestionFilters {
  deckId?: string;
  status?: CardTestSuggestionStatus;
}

/** Reduce filters to a flat, serializable object for the query key. */
function toKeyFilters(filters: CardTestSuggestionFilters): Record<string, string> {
  const keyFilters: Record<string, string> = {};
  if (filters.deckId) keyFilters["deckId"] = filters.deckId;
  if (filters.status) keyFilters["status"] = filters.status;
  return keyFilters;
}

function toQueryString(filters: CardTestSuggestionFilters): string {
  const params = new URLSearchParams();
  if (filters.deckId) params.set("deckId", filters.deckId);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The active team's card-test suggestions (filtered), via GET /api/card-test-suggestions. */
export function useCardTestSuggestions(
  teamId: string | undefined,
  filters: CardTestSuggestionFilters = {},
) {
  return useQuery<CardTestSuggestionListResponse>({
    queryKey: teamId
      ? queryKeys.cardTestSuggestions(teamId, toKeyFilters(filters))
      : ["card-test-suggestions", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/card-test-suggestions${toQueryString(filters)}`, {
        teamId,
        schema: cardTestSuggestionListResponseSchema,
      });
    },
    enabled: Boolean(teamId),
  });
}
