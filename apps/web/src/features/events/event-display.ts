import type { AttendanceStatus, EventImportance, EventStatus } from "@teambrewer/shared";

/** Human labels for the event lifecycle states (single place so UI reads consistently). */
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  upcoming: "Upcoming",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

/** Human labels for event importance. */
export const EVENT_IMPORTANCE_LABELS: Record<EventImportance, string> = {
  local: "Local",
  regional: "Regional",
  national: "National",
  major: "Major",
};

/** Human labels for a member's RSVP status. */
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  going: "Going",
  maybe: "Maybe",
  not_going: "Not going",
};

/** Native-select styling shared by the event pickers/controls (matches the decks feature). */
export const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-2 text-sm";

/**
 * Format an event's calendar date without a timezone shift. The date is stored
 * (and serialized) at **UTC midnight**, so a naive `new Date(iso).toLocaleDateString()`
 * would render the *previous* day for any viewer west of UTC. Formatting in UTC
 * keeps the day the user actually picked.
 */
export function formatEventDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, { timeZone: "UTC" });
}
