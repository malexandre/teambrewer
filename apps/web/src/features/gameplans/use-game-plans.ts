import { useQuery } from "@tanstack/react-query";
import {
  type MatchupGamePlan,
  matchupGamePlanSchema,
  type MatchupGamePlanListResponse,
  matchupGamePlanListResponseSchema,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The filters the game-plan list supports (a subset of the API query params). */
export interface GamePlanFilters {
  ourDeckId?: string;
  formatId?: string;
}

/** Reduce filters to a flat, serializable object for the query key. */
function toKeyFilters(filters: GamePlanFilters): Record<string, string> {
  const keyFilters: Record<string, string> = {};
  if (filters.ourDeckId) keyFilters["ourDeckId"] = filters.ourDeckId;
  if (filters.formatId) keyFilters["formatId"] = filters.formatId;
  return keyFilters;
}

function toQueryString(filters: GamePlanFilters): string {
  const params = new URLSearchParams();
  if (filters.ourDeckId) params.set("ourDeckId", filters.ourDeckId);
  if (filters.formatId) params.set("formatId", filters.formatId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The active team's matchup game-plans (filtered), via GET /api/game-plans. */
export function useGamePlans(teamId: string | undefined, filters: GamePlanFilters = {}) {
  return useQuery<MatchupGamePlanListResponse>({
    queryKey: teamId ? queryKeys.gamePlans(teamId, toKeyFilters(filters)) : ["game-plans", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/game-plans${toQueryString(filters)}`, {
        teamId,
        schema: matchupGamePlanListResponseSchema,
      });
    },
    enabled: Boolean(teamId),
  });
}

/** A single game-plan by id, via GET /api/game-plans/:gamePlanId. */
export function useGamePlan(teamId: string | undefined, gamePlanId: string) {
  return useQuery<MatchupGamePlan>({
    queryKey: teamId ? queryKeys.gamePlan(teamId, gamePlanId) : ["game-plan", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/game-plans/${gamePlanId}`, { teamId, schema: matchupGamePlanSchema });
    },
    enabled: Boolean(teamId),
  });
}
