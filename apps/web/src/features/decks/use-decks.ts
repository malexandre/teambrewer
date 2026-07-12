import { useQuery } from "@tanstack/react-query";
import {
  type DeckDetail,
  deckDetailSchema,
  type DeckListResponse,
  deckListResponseSchema,
  type DeckStatus,
  type IterationEntryList,
  iterationEntryListSchema,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The filters the deck list supports (a subset of the API query params). */
export interface DeckFilters {
  status?: DeckStatus;
  formatId?: string;
  heroId?: string;
  ownerId?: string;
  isReference?: boolean;
}

/** Reduce filters to a flat, serializable object for the query key. */
function toKeyFilters(filters: DeckFilters): Record<string, string | boolean> {
  const keyFilters: Record<string, string | boolean> = {};
  if (filters.status) keyFilters["status"] = filters.status;
  if (filters.formatId) keyFilters["formatId"] = filters.formatId;
  if (filters.heroId) keyFilters["heroId"] = filters.heroId;
  if (filters.ownerId) keyFilters["ownerId"] = filters.ownerId;
  if (filters.isReference !== undefined) keyFilters["isReference"] = filters.isReference;
  return keyFilters;
}

function toQueryString(filters: DeckFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.formatId) params.set("formatId", filters.formatId);
  if (filters.heroId) params.set("heroId", filters.heroId);
  if (filters.ownerId) params.set("ownerId", filters.ownerId);
  if (filters.isReference !== undefined) params.set("isReference", String(filters.isReference));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The active team's decks (filtered), via GET /api/decks. */
export function useDecks(teamId: string | undefined, filters: DeckFilters = {}) {
  return useQuery<DeckListResponse>({
    queryKey: teamId ? queryKeys.decks(teamId, toKeyFilters(filters)) : ["decks", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/decks${toQueryString(filters)}`, {
        teamId,
        schema: deckListResponseSchema,
      });
    },
    enabled: Boolean(teamId),
  });
}

/** A single deck's detail, via GET /api/decks/:deckId. */
export function useDeck(teamId: string | undefined, deckId: string | undefined) {
  return useQuery<DeckDetail>({
    queryKey: teamId && deckId ? queryKeys.deck(teamId, deckId) : ["deck", "none"],
    queryFn: () => {
      if (!teamId || !deckId) {
        throw new Error("No active team or deck.");
      }
      return apiClient.get(`/decks/${deckId}`, { teamId, schema: deckDetailSchema });
    },
    enabled: Boolean(teamId && deckId),
  });
}

/** A deck's iteration log (most-recent first), via GET /api/decks/:deckId/iteration-entries. */
export function useDeckIterations(teamId: string | undefined, deckId: string | undefined) {
  return useQuery<IterationEntryList>({
    queryKey:
      teamId && deckId ? queryKeys.deckIterations(teamId, deckId) : ["deck-iterations", "none"],
    queryFn: () => {
      if (!teamId || !deckId) {
        throw new Error("No active team or deck.");
      }
      return apiClient.get(`/decks/${deckId}/iteration-entries`, {
        teamId,
        schema: iterationEntryListSchema,
      });
    },
    enabled: Boolean(teamId && deckId),
  });
}
