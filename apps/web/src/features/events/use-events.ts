import { useQuery } from "@tanstack/react-query";
import {
  type AttendanceList,
  attendanceListSchema,
  type EventDetail,
  eventDetailSchema,
  type EventListResponse,
  eventListResponseSchema,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The active team's events, via GET /api/events. */
export function useEvents(teamId: string | undefined) {
  return useQuery<EventListResponse>({
    queryKey: teamId ? queryKeys.events(teamId, {}) : ["events", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get("/events", { teamId, schema: eventListResponseSchema });
    },
    enabled: Boolean(teamId),
  });
}

/** A single event's detail (with attendance summary), via GET /api/events/:eventId. */
export function useEvent(teamId: string | undefined, eventId: string | undefined) {
  return useQuery<EventDetail>({
    queryKey: teamId && eventId ? queryKeys.event(teamId, eventId) : ["event", "none"],
    queryFn: () => {
      if (!teamId || !eventId) {
        throw new Error("No active team or event.");
      }
      return apiClient.get(`/events/${eventId}`, { teamId, schema: eventDetailSchema });
    },
    enabled: Boolean(teamId && eventId),
  });
}

/** An event's attendance roster, via GET /api/events/:eventId/attendance. */
export function useAttendance(teamId: string | undefined, eventId: string | undefined) {
  return useQuery<AttendanceList>({
    queryKey:
      teamId && eventId ? queryKeys.eventAttendance(teamId, eventId) : ["event-attendance", "none"],
    queryFn: () => {
      if (!teamId || !eventId) {
        throw new Error("No active team or event.");
      }
      return apiClient.get(`/events/${eventId}/attendance`, {
        teamId,
        schema: attendanceListSchema,
      });
    },
    enabled: Boolean(teamId && eventId),
  });
}
