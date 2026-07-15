import { useQuery } from "@tanstack/react-query";
import {
  type DeckCardObservationsResponse,
  deckCardObservationsResponseSchema,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/**
 * A deck's rolled-up card observations (impressive/underperforming counts per card),
 * via GET /api/decks/:deckId/card-observations. Team-scoped by the active `teamId` in
 * the query key.
 */
export function useDeckCardObservations(teamId: string | undefined, deckId: string | undefined) {
  return useQuery<DeckCardObservationsResponse>({
    queryKey:
      teamId && deckId
        ? queryKeys.deckCardObservations(teamId, deckId)
        : ["deck-card-observations", "none"],
    queryFn: () => {
      if (!teamId || !deckId) {
        throw new Error("No active team or deck.");
      }
      return apiClient.get(`/decks/${deckId}/card-observations`, {
        teamId,
        schema: deckCardObservationsResponseSchema,
      });
    },
    enabled: Boolean(teamId && deckId),
  });
}
