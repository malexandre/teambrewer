import { useQuery } from "@tanstack/react-query";
import {
  type MetaDeckEntryList,
  metaDeckEntryListSchema,
  type MetaDetail,
  metaDetailSchema,
  type MetaListResponse,
  metaListResponseSchema,
} from "@teambrewer/shared";

import { ApiError, apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The active team's non-archived metas (newest window first), via GET /api/metas. */
export function useMetas(teamId: string | undefined) {
  return useQuery<MetaListResponse>({
    queryKey: teamId ? queryKeys.metas(teamId, {}) : ["metas", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/metas`, { teamId, schema: metaListResponseSchema });
    },
    enabled: Boolean(teamId),
  });
}

/**
 * The current meta (the window that contains today), via GET /api/metas/current.
 * The endpoint answers 404 when none is current; we surface that as `null` data so
 * callers render an empty state rather than an error.
 */
export function useCurrentMeta(teamId: string | undefined) {
  return useQuery<MetaDetail | null>({
    queryKey: teamId ? queryKeys.currentMeta(teamId) : ["current-meta", "none"],
    queryFn: async () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      try {
        return await apiClient.get<MetaDetail>(`/metas/current`, {
          teamId,
          schema: metaDetailSchema,
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: Boolean(teamId),
  });
}

/** A single meta's detail, via GET /api/metas/:metaId. */
export function useMeta(teamId: string | undefined, metaId: string | undefined) {
  return useQuery<MetaDetail>({
    queryKey: teamId && metaId ? queryKeys.meta(teamId, metaId) : ["meta", "none"],
    queryFn: () => {
      if (!teamId || !metaId) {
        throw new Error("No active team or meta.");
      }
      return apiClient.get(`/metas/${metaId}`, { teamId, schema: metaDetailSchema });
    },
    enabled: Boolean(teamId && metaId),
  });
}

/** A meta's tiered opponent-deck list, via GET /api/metas/:metaId/deck-entries. */
export function useMetaDeckEntries(teamId: string | undefined, metaId: string | undefined) {
  return useQuery<MetaDeckEntryList>({
    queryKey:
      teamId && metaId ? queryKeys.metaDeckEntries(teamId, metaId) : ["meta-deck-entries", "none"],
    queryFn: () => {
      if (!teamId || !metaId) {
        throw new Error("No active team or meta.");
      }
      return apiClient.get(`/metas/${metaId}/deck-entries`, {
        teamId,
        schema: metaDeckEntryListSchema,
      });
    },
    enabled: Boolean(teamId && metaId),
  });
}
