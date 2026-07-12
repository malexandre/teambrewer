import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type DeckSelection,
  type DeckSelectionList,
  deckSelectionListSchema,
  deckSelectionSchema,
  type SetDeckSelectionInput,
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

/** The event's deck-selection roster, via GET /api/events/:eventId/deck-selections. */
export function useEventDeckSelections(teamId: string | undefined, eventId: string) {
  return useQuery<DeckSelectionList>({
    queryKey: teamId
      ? queryKeys.eventDeckSelections(teamId, eventId)
      : ["event", eventId, "deck-selections", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/events/${eventId}/deck-selections`, {
        teamId,
        schema: deckSelectionListSchema,
      });
    },
    enabled: Boolean(teamId),
  });
}

/** Upsert the caller's own selection (PUT /api/events/:eventId/deck-selections/me). */
export function useSetMyDeckSelection(teamId: string | undefined, eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetDeckSelectionInput) =>
      apiClient.put<DeckSelection>(`/events/${eventId}/deck-selections/me`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: deckSelectionSchema,
      }),
    onSuccess: () => invalidate(queryClient, teamId, eventId),
  });
}

/** Lock a selection (team-admin only). */
export function useLockDeckSelection(teamId: string | undefined, eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (selectionId: string) =>
      apiClient.patch<DeckSelection>(`/events/${eventId}/deck-selections/${selectionId}/lock`, {
        teamId: requireTeam(teamId),
        schema: deckSelectionSchema,
      }),
    onSuccess: () => invalidate(queryClient, teamId, eventId),
  });
}

/** Unlock a selection (team-admin only). */
export function useUnlockDeckSelection(teamId: string | undefined, eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (selectionId: string) =>
      apiClient.patch<DeckSelection>(`/events/${eventId}/deck-selections/${selectionId}/unlock`, {
        teamId: requireTeam(teamId),
        schema: deckSelectionSchema,
      }),
    onSuccess: () => invalidate(queryClient, teamId, eventId),
  });
}

function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
  eventId: string,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: queryKeys.eventDeckSelections(teamId, eventId) });
}
