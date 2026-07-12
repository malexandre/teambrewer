import { useQuery } from "@tanstack/react-query";
import {
  type AttendanceList,
  attendanceListSchema,
  type EventDetail,
  eventDetailSchema,
  type EventImportance,
  type EventListResponse,
  eventListResponseSchema,
  type EventStatus,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The filters the event list supports (a subset of the API query params). */
export interface EventFilters {
  status?: EventStatus;
  formatId?: string;
  importance?: EventImportance;
}

/** Reduce filters to a flat, serializable object for the query key. */
function toKeyFilters(filters: EventFilters): Record<string, string> {
  const keyFilters: Record<string, string> = {};
  if (filters.status) keyFilters["status"] = filters.status;
  if (filters.formatId) keyFilters["formatId"] = filters.formatId;
  if (filters.importance) keyFilters["importance"] = filters.importance;
  return keyFilters;
}

function toQueryString(filters: EventFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.formatId) params.set("formatId", filters.formatId);
  if (filters.importance) params.set("importance", filters.importance);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The active team's events (filtered), via GET /api/events. */
export function useEvents(teamId: string | undefined, filters: EventFilters = {}) {
  return useQuery<EventListResponse>({
    queryKey: teamId ? queryKeys.events(teamId, toKeyFilters(filters)) : ["events", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get(`/events${toQueryString(filters)}`, {
        teamId,
        schema: eventListResponseSchema,
      });
    },
    enabled: Boolean(teamId),
  });
}

/** A single event's detail (with gauntlet + attendance summary), via GET /api/events/:eventId. */
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
