import { useQueries, useQuery } from "@tanstack/react-query";
import {
  type LinkCandidatesResponse,
  linkCandidatesResponseSchema,
  type MetaDeckEntry,
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

/**
 * Resolve the deck entries of several metas at once into a Map keyed by entry id
 * (one team-scoped query per meta, sharing the same cache key as {@link
 * useMetaDeckEntries}). Used where a stored `metaDeckEntryId` needs to be rendered
 * as its hero · label — e.g. the game-log list, which references entries across
 * whatever metas its games count toward.
 */
export function useMetaDeckEntriesByMeta(
  teamId: string | undefined,
  metaIds: string[],
): Map<string, MetaDeckEntry> {
  const results = useQueries({
    queries: metaIds.map((metaId) => ({
      queryKey: teamId
        ? queryKeys.metaDeckEntries(teamId, metaId)
        : ["meta-deck-entries", "none", metaId],
      queryFn: () => {
        if (!teamId) {
          throw new Error("No active team.");
        }
        return apiClient.get(`/metas/${metaId}/deck-entries`, {
          teamId,
          schema: metaDeckEntryListSchema,
        });
      },
      enabled: Boolean(teamId),
    })),
  });

  const entriesById = new Map<string, MetaDeckEntry>();
  for (const result of results) {
    for (const entry of result.data?.data ?? []) {
      entriesById.set(entry.id, entry);
    }
  }
  return entriesById;
}

/**
 * The recorded games eligible to retro-link to a meta deck entry (unlinked + matching
 * its hero/label), via GET .../deck-entries/:entryId/link-candidates. Gated by
 * `enabled` so the modal only fetches when open.
 */
export function useEntryLinkCandidates(
  teamId: string | undefined,
  metaId: string,
  entryId: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery<LinkCandidatesResponse>({
    queryKey: teamId
      ? [teamId, "meta-link-candidates", metaId, entryId]
      : ["meta-link-candidates", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/metas/${metaId}/deck-entries/${entryId}/link-candidates`, {
        teamId,
        schema: linkCandidatesResponseSchema,
      });
    },
    enabled: (options.enabled ?? true) && Boolean(teamId),
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
