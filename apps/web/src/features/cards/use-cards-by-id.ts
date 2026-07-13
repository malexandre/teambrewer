import { useQueries } from "@tanstack/react-query";
import { cardSummarySchema, type CardSummary } from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/**
 * Resolve a set of card ids to their summaries for the active team's game via
 * GET /api/cards/:cardId (one query per id, sharing the same team-scoped cache
 * key as {@link useCard}, so a card already fetched elsewhere is reused). Pass
 * the deduped ids from `parseCardTokens`; the returned map only contains ids
 * that resolved, so unknown/deleted ids are simply absent (the renderer shows a
 * graceful fallback rather than crashing).
 */
export function useCardsById(
  teamId: string | undefined,
  cardIds: string[],
): Map<string, CardSummary> {
  const results = useQueries({
    queries: cardIds.map((cardId) => ({
      queryKey: teamId ? queryKeys.card(teamId, cardId) : ["card", "none", cardId],
      queryFn: () => {
        if (!teamId) {
          throw new Error("No active team.");
        }
        return apiClient.get(`/cards/${cardId}`, { teamId, schema: cardSummarySchema });
      },
      enabled: Boolean(teamId),
    })),
  });

  const cardsById = new Map<string, CardSummary>();
  cardIds.forEach((cardId, index) => {
    const card = results[index]?.data;
    if (card) {
      cardsById.set(cardId, card);
    }
  });
  return cardsById;
}
