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
