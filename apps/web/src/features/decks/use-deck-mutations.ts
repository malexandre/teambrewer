import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateDeckInput,
  type CreateIterationEntryInput,
  type DeckDetail,
  deckDetailSchema,
  type DeckStatus,
  type IterationEntry,
  iterationEntrySchema,
  type RecognizeDeckUrlResponse,
  recognizeDeckUrlResponseSchema,
  type UpdateDeckInput,
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

/** Create a deck (POST /api/decks); invalidates the team's deck lists. */
export function useCreateDeck(teamId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDeckInput) =>
      apiClient.post<DeckDetail>("/decks", {
        teamId: requireTeam(teamId),
        body: input,
        schema: deckDetailSchema,
      }),
    onSuccess: () => {
      if (teamId) void queryClient.invalidateQueries({ queryKey: [teamId, "decks"] });
    },
  });
}

/** Update a deck's metadata (PATCH /api/decks/:deckId). */
export function useUpdateDeck(teamId: string | undefined, deckId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateDeckInput) =>
      apiClient.patch<DeckDetail>(`/decks/${deckId}`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: deckDetailSchema,
      }),
    onSuccess: () => invalidateDeck(queryClient, teamId, deckId),
  });
}

/** Move a deck through its status lifecycle (PATCH /api/decks/:deckId/status). */
export function useChangeDeckStatus(teamId: string | undefined, deckId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: DeckStatus) =>
      apiClient.patch<DeckDetail>(`/decks/${deckId}/status`, {
        teamId: requireTeam(teamId),
        body: { status },
        schema: deckDetailSchema,
      }),
    onSuccess: () => invalidateDeck(queryClient, teamId, deckId),
  });
}

/** Archive a deck (DELETE /api/decks/:deckId). */
export function useArchiveDeck(teamId: string | undefined, deckId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<void>(`/decks/${deckId}`, { teamId: requireTeam(teamId) }),
    onSuccess: () => invalidateDeck(queryClient, teamId, deckId),
  });
}

/** Append an iteration-log entry (POST /api/decks/:deckId/iteration-entries). */
export function useAddIterationEntry(teamId: string | undefined, deckId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIterationEntryInput) =>
      apiClient.post<IterationEntry>(`/decks/${deckId}/iteration-entries`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: iterationEntrySchema,
      }),
    onSuccess: () => {
      if (teamId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.deckIterations(teamId, deckId) });
      }
    },
  });
}

/** Best-effort deck-URL recognition for the form's live provider hint. */
export function useRecognizeDeckUrl(teamId: string | undefined) {
  return useMutation({
    mutationFn: (url: string) =>
      apiClient.post<RecognizeDeckUrlResponse>("/decks/recognize-url", {
        teamId: requireTeam(teamId),
        body: { url },
        schema: recognizeDeckUrlResponseSchema,
      }),
  });
}

function invalidateDeck(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
  deckId: string,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: [teamId, "decks"] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.deck(teamId, deckId) });
}
