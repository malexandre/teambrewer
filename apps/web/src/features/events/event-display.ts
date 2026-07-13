import type { AttendanceStatus } from "@teambrewer/shared";

/** Human labels for a member's RSVP status. */
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  going: "Going",
  interested: "Interested",
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
