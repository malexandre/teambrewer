import { useQuery } from "@tanstack/react-query";
import { cardSummarySchema, type CardSummary } from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** A single card in the active team's game via GET /api/cards/:cardId. */
export function useCard(teamId: string | undefined, cardId: string | undefined) {
  return useQuery<CardSummary>({
    queryKey: teamId && cardId ? queryKeys.card(teamId, cardId) : ["card", "none"],
    queryFn: () => {
      if (!teamId || !cardId) {
        throw new Error("No active team or card.");
      }
      return apiClient.get(`/cards/${cardId}`, { teamId, schema: cardSummarySchema });
    },
    enabled: Boolean(teamId && cardId),
  });
}
