import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateMetaDeckEntryInput,
  type CreateMetaInput,
  type MetaDeckEntry,
  metaDeckEntrySchema,
  type MetaDetail,
  metaDetailSchema,
  type UpdateMetaDeckEntryInput,
  type UpdateMetaInput,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** Require an active team before a mutation runs (pages only render one when present). */
function requireTeam(teamId: string | undefined): string {
  if (!teamId) {
    throw new Error("No active team.");
  }
  return teamId;
}

/** Create a meta (POST /api/metas); invalidates the team's meta lists + the current meta. */
export function useCreateMeta(teamId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMetaInput) =>
      apiClient.post<MetaDetail>("/metas", {
        teamId: requireTeam(teamId),
        body: input,
        schema: metaDetailSchema,
      }),
    onSuccess: () => invalidateMetaLists(queryClient, teamId),
  });
}

/** Update a meta's fields (PATCH /api/metas/:metaId). */
export function useUpdateMeta(teamId: string | undefined, metaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMetaInput) =>
      apiClient.patch<MetaDetail>(`/metas/${metaId}`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: metaDetailSchema,
      }),
    onSuccess: () => {
      invalidateMetaLists(queryClient, teamId);
      if (teamId) void queryClient.invalidateQueries({ queryKey: queryKeys.meta(teamId, metaId) });
    },
  });
}

/** Archive a meta (DELETE /api/metas/:metaId). */
export function useArchiveMeta(teamId: string | undefined, metaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<void>(`/metas/${metaId}`, { teamId: requireTeam(teamId) }),
    onSuccess: () => {
      invalidateMetaLists(queryClient, teamId);
      if (teamId) void queryClient.invalidateQueries({ queryKey: queryKeys.meta(teamId, metaId) });
    },
  });
}

/** Add a deck entry (POST /api/metas/:metaId/deck-entries). */
export function useAddMetaDeckEntry(teamId: string | undefined, metaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMetaDeckEntryInput) =>
      apiClient.post<MetaDeckEntry>(`/metas/${metaId}/deck-entries`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: metaDeckEntrySchema,
      }),
    onSuccess: () => invalidateDeckEntries(queryClient, teamId, metaId),
  });
}

/** Update a deck entry's tier/notes (PATCH .../deck-entries/:entryId). */
export function useUpdateMetaDeckEntry(teamId: string | undefined, metaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { entryId: string; body: UpdateMetaDeckEntryInput }) =>
      apiClient.patch<MetaDeckEntry>(`/metas/${metaId}/deck-entries/${input.entryId}`, {
        teamId: requireTeam(teamId),
        body: input.body,
        schema: metaDeckEntrySchema,
      }),
    onSuccess: () => invalidateDeckEntries(queryClient, teamId, metaId),
  });
}

/** Remove a deck entry (DELETE .../deck-entries/:entryId). */
export function useRemoveMetaDeckEntry(teamId: string | undefined, metaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) =>
      apiClient.delete<void>(`/metas/${metaId}/deck-entries/${entryId}`, {
        teamId: requireTeam(teamId),
      }),
    onSuccess: () => invalidateDeckEntries(queryClient, teamId, metaId),
  });
}

function invalidateMetaLists(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: [teamId, "metas"] });
}

function invalidateDeckEntries(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
  metaId: string,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: queryKeys.metaDeckEntries(teamId, metaId) });
}
