import { useQuery } from "@tanstack/react-query";
import {
  type MetaDeckEntryList,
  metaDeckEntryListSchema,
  type MetaDetail,
  metaDetailSchema,
  type MetaListResponse,
  metaListResponseSchema,
  type MetaSummary,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
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
 * The most recent meta of a given format from an already-loaded metas list (the metas
 * list is newest-first, so this mirrors the server's per-format default). Returns
 * `undefined` when the format has no meta yet.
 */
export function mostRecentMetaForFormat(
  metas: MetaSummary[],
  formatId: string | undefined,
): MetaSummary | undefined {
  if (!formatId) {
    return undefined;
  }
  return metas.find((meta) => meta.formatId === formatId);
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
