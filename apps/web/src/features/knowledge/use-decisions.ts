import { useQuery } from "@tanstack/react-query";
import {
  type Decision,
  decisionSchema,
  type DecisionListResponse,
  decisionListResponseSchema,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The active team's decisions log (reverse-chronological), via GET /api/decisions. */
export function useDecisions(teamId: string | undefined) {
  return useQuery<DecisionListResponse>({
    queryKey: teamId ? queryKeys.decisions(teamId, {}) : ["decisions", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get("/decisions", { teamId, schema: decisionListResponseSchema });
    },
    enabled: Boolean(teamId),
  });
}

/** A single decision by id, via GET /api/decisions/:decisionId. */
export function useDecision(teamId: string | undefined, decisionId: string) {
  return useQuery<Decision>({
    queryKey: teamId ? queryKeys.decision(teamId, decisionId) : ["decision", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/decisions/${decisionId}`, { teamId, schema: decisionSchema });
    },
    enabled: Boolean(teamId),
  });
}
