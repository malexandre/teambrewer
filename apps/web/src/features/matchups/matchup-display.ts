import type { MatchupCell, TrustIndicator } from "@teambrewer/shared";

/** Native-select styling shared by the matchup scope controls (matches events/decks). */
export const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-2 text-sm";

/** Human labels for the trust buckets (single place so the UI reads consistently). */
export const TRUST_INDICATOR_LABELS: Record<TrustIndicator, string> = {
  low: "Low trust",
  medium: "Medium trust",
  high: "High trust",
};

/**
 * Tailwind classes for a trust badge. Trust must be visually unmissable: a strong
 * win rate over a low effective sample is styled tentative (amber/grey), never a
 * confident green — only a `high` bucket earns green.
 */
export const TRUST_INDICATOR_BADGE_CLASS: Record<TrustIndicator, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  high: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
};

/** Format a weighted win rate as a whole-percent string, or an em dash when absent. */
export function formatWinRate(weightedWinRate: number | null): string {
  if (weightedWinRate === null) return "—";
  return `${Math.round(weightedWinRate * 100)}%`;
}

/** Round the effective sample for display (it is stored to 4 decimals). */
export function formatEffectiveSample(effectiveSample: number): string {
  return (Math.round(effectiveSample * 10) / 10).toString();
}

/**
 * The one-line summary the feature calls for — e.g. "79% · N=4 · low trust" — so a
 * cell always states the rate, the raw sample, and how trustworthy it is together.
 */
export function summarizeCell(cell: MatchupCell): string {
  return `${formatWinRate(cell.weightedWinRate)} · N=${cell.rawSampleCount} · ${
    TRUST_INDICATOR_LABELS[cell.trustIndicator]
  }`;
}
