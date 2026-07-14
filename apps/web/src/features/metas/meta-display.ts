import type { MetaTier } from "@teambrewer/shared";

import type { BadgeTone } from "@/components/ui/badge";

// The subject display helper is a shared single source of truth (hero · label);
// re-exported here so existing meta-feature imports keep their path.
export { matchupSubjectDisplayName } from "@teambrewer/shared";

/** Badge tone per meta tier — a graded threat ramp: meta-defining is the loudest
 *  (danger), then contender (warning), counter-meta (info), and fringe (neutral). */
export const META_TIER_TONE: Record<MetaTier, BadgeTone> = {
  meta_defining: "danger",
  contender: "warning",
  counter_meta: "info",
  fringe: "neutral",
};

/** Native-select styling shared by the meta pickers/controls (matches the decks feature). */
export const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-2 text-sm";

/**
 * Format a meta's boundary date without a timezone shift. Boundaries are stored (and
 * serialized) at **UTC midnight**, so a naive `new Date(iso).toLocaleDateString()`
 * would render the *previous* day for any viewer west of UTC. Formatting in UTC keeps
 * the day the user actually picked.
 */
export function formatMetaDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, { timeZone: "UTC" });
}

/** The `YYYY-MM-DD` value a native date input expects, from an ISO date string. */
export function toDateInputValue(isoDate: string | undefined): string {
  if (!isoDate) return "";
  return isoDate.slice(0, 10);
}

/**
 * The short month + day-of-month for an ISO boundary date, for a calendar-page motif
 * (used by the Events page). Formatted in **UTC** for the same reason as
 * {@link formatMetaDate} — boundaries are stored at UTC midnight, so a naive local read
 * would shift the day west.
 */
export function calendarParts(isoDate: string): { month: string; day: string } {
  const date = new Date(isoDate);
  return {
    month: date.toLocaleDateString(undefined, { timeZone: "UTC", month: "short" }),
    day: date.toLocaleDateString(undefined, { timeZone: "UTC", day: "2-digit" }),
  };
}
