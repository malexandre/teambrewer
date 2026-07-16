import type { AttendanceStatus } from "@teambrewer/shared";

import type { BadgeTone } from "@/components/ui/badge";

/** Human labels for a member's RSVP status. */
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  going: "Going",
  interested: "Interested",
};

/** Badge tone per RSVP: a committed "going" reads as success, "interested" as info. */
export const ATTENDANCE_STATUS_TONE: Record<AttendanceStatus, BadgeTone> = {
  going: "success",
  interested: "info",
};

/**
 * Format an event's calendar date without a timezone shift. The date is stored
 * (and serialized) at **UTC midnight**, so a naive `new Date(iso).toLocaleDateString()`
 * would render the *previous* day for any viewer west of UTC. Formatting in UTC
 * keeps the day the user actually picked.
 */
export function formatEventDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, { timeZone: "UTC" });
}
