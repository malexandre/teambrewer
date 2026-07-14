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
 * The display name of a matchup subject (a meta deck entry or a readiness opponent),
 * always leading with the hero name when one is known, then the free-text archetype
 * label. Mirrors the "hero, then label" shape used across the meta/matchup surfaces:
 *
 * - hero + non-empty label → `${heroName} · ${label}` (the middle dot is U+00B7),
 * - hero, no label → the hero name alone,
 * - no hero → the label alone.
 *
 * `heroName` is `null`/`undefined` when the entry is label-only or the hero list has
 * not resolved yet; callers fall back to the stored snapshot label in the latter case.
 */
export function matchupSubjectDisplayName(
  heroName: string | null | undefined,
  label: string,
): string {
  if (!heroName) {
    return label;
  }
  return label.trim().length > 0 ? `${heroName} · ${label}` : heroName;
}
