import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type Attendance,
  attendanceSchema,
  type CreateEventInput,
  type CreateGauntletEntryInput,
  type EventDetail,
  eventDetailSchema,
  type GauntletEntry,
  gauntletEntrySchema,
  type SetAttendanceInput,
  type UpdateEventInput,
  type UpdateGauntletEntryInput,
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

/** Create an event (POST /api/events); invalidates the team's event lists. */
export function useCreateEvent(teamId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEventInput) =>
      apiClient.post<EventDetail>("/events", {
        teamId: requireTeam(teamId),
        body: input,
        schema: eventDetailSchema,
      }),
    onSuccess: () => {
      if (teamId) void queryClient.invalidateQueries({ queryKey: [teamId, "events"] });
    },
  });
}

/** Update an event's fields and/or advance its status (PATCH /api/events/:eventId). */
export function useUpdateEvent(teamId: string | undefined, eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateEventInput) =>
      apiClient.patch<EventDetail>(`/events/${eventId}`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: eventDetailSchema,
      }),
    onSuccess: () => invalidateEvent(queryClient, teamId, eventId),
  });
}

/** Archive an event (DELETE /api/events/:eventId). */
export function useArchiveEvent(teamId: string | undefined, eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<void>(`/events/${eventId}`, { teamId: requireTeam(teamId) }),
    onSuccess: () => invalidateEvent(queryClient, teamId, eventId),
  });
}

/** Add a gauntlet entry (POST /api/events/:eventId/gauntlet-entries). */
export function useAddGauntletEntry(teamId: string | undefined, eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGauntletEntryInput) =>
      apiClient.post<GauntletEntry>(`/events/${eventId}/gauntlet-entries`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: gauntletEntrySchema,
      }),
    onSuccess: () => invalidateGauntlet(queryClient, teamId, eventId),
  });
}

/** Update a gauntlet entry's share/notes (PATCH .../gauntlet-entries/:gauntletEntryId). */
export function useUpdateGauntletEntry(teamId: string | undefined, eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { gauntletEntryId: string; body: UpdateGauntletEntryInput }) =>
      apiClient.patch<GauntletEntry>(
        `/events/${eventId}/gauntlet-entries/${input.gauntletEntryId}`,
        {
          teamId: requireTeam(teamId),
          body: input.body,
          schema: gauntletEntrySchema,
        },
      ),
    onSuccess: () => invalidateGauntlet(queryClient, teamId, eventId),
  });
}

/** Remove a gauntlet entry (DELETE .../gauntlet-entries/:gauntletEntryId). */
export function useRemoveGauntletEntry(teamId: string | undefined, eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (gauntletEntryId: string) =>
      apiClient.delete<void>(`/events/${eventId}/gauntlet-entries/${gauntletEntryId}`, {
        teamId: requireTeam(teamId),
      }),
    onSuccess: () => invalidateGauntlet(queryClient, teamId, eventId),
  });
}

/** Set my RSVP (PUT /api/events/:eventId/attendance/me); idempotent upsert. */
export function useSetMyAttendance(teamId: string | undefined, eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetAttendanceInput) =>
      apiClient.put<Attendance>(`/events/${eventId}/attendance/me`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: attendanceSchema,
      }),
    onSuccess: () => {
      if (!teamId) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventAttendance(teamId, eventId) });
      // The event detail embeds an attendance summary — refresh it too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.event(teamId, eventId) });
    },
  });
}

function invalidateEvent(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
  eventId: string,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: [teamId, "events"] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.event(teamId, eventId) });
}

function invalidateGauntlet(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
  eventId: string,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: queryKeys.eventGauntlet(teamId, eventId) });
  // The event detail embeds the gauntlet — refresh it too.
  void queryClient.invalidateQueries({ queryKey: queryKeys.event(teamId, eventId) });
}
