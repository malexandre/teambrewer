import { useQuery } from "@tanstack/react-query";
import {
  type PrimerDetail,
  primerDetailSchema,
  type PrimerListResponse,
  primerListResponseSchema,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The filters the primer list supports (a subset of the API query params). */
export interface PrimerFilters {
  kind?: string;
  relatedDeckId?: string;
}

function toKeyFilters(filters: PrimerFilters): Record<string, string> {
  const keyFilters: Record<string, string> = {};
  if (filters.kind) keyFilters["kind"] = filters.kind;
  if (filters.relatedDeckId) keyFilters["relatedDeckId"] = filters.relatedDeckId;
  return keyFilters;
}

function toQueryString(filters: PrimerFilters): string {
  const params = new URLSearchParams();
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.relatedDeckId) params.set("relatedDeckId", filters.relatedDeckId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The active team's primers (filtered), via GET /api/primers. */
export function usePrimers(teamId: string | undefined, filters: PrimerFilters = {}) {
  return useQuery<PrimerListResponse>({
    queryKey: teamId ? queryKeys.primers(teamId, toKeyFilters(filters)) : ["primers", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/primers${toQueryString(filters)}`, {
        teamId,
        schema: primerListResponseSchema,
      });
    },
    enabled: Boolean(teamId),
  });
}

/** A single primer by id, via GET /api/primers/:primerId. */
export function usePrimer(teamId: string | undefined, primerId: string) {
  return useQuery<PrimerDetail>({
    queryKey: teamId ? queryKeys.primer(teamId, primerId) : ["primer", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/primers/${primerId}`, { teamId, schema: primerDetailSchema });
    },
    enabled: Boolean(teamId),
  });
}
