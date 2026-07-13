import { useQuery } from "@tanstack/react-query";
import {
  type DeckMetaReadinessResponse,
  deckMetaReadinessResponseSchema,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/**
 * A deck's confidence-weighted readiness against a meta's deck list, via
 * GET /api/decks/:deckId/meta-readiness (defaults to the current meta when no
 * `metaId` is given). Team-scoped by the active `teamId` in the query key.
 */
export function useDeckMetaReadiness(
  teamId: string | undefined,
  deckId: string | undefined,
  metaId?: string,
) {
  return useQuery<DeckMetaReadinessResponse>({
    queryKey:
      teamId && deckId
        ? queryKeys.deckMetaReadiness(teamId, deckId, metaId)
        : ["deck-meta-readiness", "none"],
    queryFn: () => {
      if (!teamId || !deckId) {
        throw new Error("No active team or deck.");
      }
      const suffix = metaId ? `?metaId=${encodeURIComponent(metaId)}` : "";
      return apiClient.get(`/decks/${deckId}/meta-readiness${suffix}`, {
        teamId,
        schema: deckMetaReadinessResponseSchema,
      });
    },
    enabled: Boolean(teamId && deckId),
  });
}
