import { useQuery } from "@tanstack/react-query";
import {
  type GameLogDetail,
  gameLogDetailSchema,
  type GameLogListResponse,
  gameLogListResponseSchema,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The filters the game-log list supports (a subset of the API query params). */
export interface GameFilters {
  formatId?: string;
  metaId?: string;
  deckId?: string;
  heroId?: string;
  pilotUserId?: string;
}

/** Reduce filters to a flat, serializable object for the query key. */
function toKeyFilters(filters: GameFilters): Record<string, string> {
  const keyFilters: Record<string, string> = {};
  if (filters.formatId) keyFilters["formatId"] = filters.formatId;
  if (filters.metaId) keyFilters["metaId"] = filters.metaId;
  if (filters.deckId) keyFilters["deckId"] = filters.deckId;
  if (filters.heroId) keyFilters["heroId"] = filters.heroId;
  if (filters.pilotUserId) keyFilters["pilotUserId"] = filters.pilotUserId;
  return keyFilters;
}

function toQueryString(filters: GameFilters): string {
  const params = new URLSearchParams();
  if (filters.formatId) params.set("formatId", filters.formatId);
  if (filters.metaId) params.set("metaId", filters.metaId);
  if (filters.deckId) params.set("deckId", filters.deckId);
  if (filters.heroId) params.set("heroId", filters.heroId);
  if (filters.pilotUserId) params.set("pilotUserId", filters.pilotUserId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The active team's game logs (filtered), via GET /api/game-logs. */
export function useGames(teamId: string | undefined, filters: GameFilters = {}) {
  return useQuery<GameLogListResponse>({
    queryKey: teamId ? queryKeys.games(teamId, toKeyFilters(filters)) : ["games", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/game-logs${toQueryString(filters)}`, {
        teamId,
        schema: gameLogListResponseSchema,
      });
    },
    enabled: Boolean(teamId),
  });
}

/** A single game log's detail, via GET /api/game-logs/:gameLogId. */
export function useGame(teamId: string | undefined, gameLogId: string | undefined) {
  return useQuery<GameLogDetail>({
    queryKey: teamId && gameLogId ? queryKeys.game(teamId, gameLogId) : ["game", "none"],
    queryFn: () => {
      if (!teamId || !gameLogId) {
        throw new Error("No active team or game log.");
      }
      return apiClient.get(`/game-logs/${gameLogId}`, { teamId, schema: gameLogDetailSchema });
    },
    enabled: Boolean(teamId && gameLogId),
  });
}
