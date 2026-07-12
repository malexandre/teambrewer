import type { GameLogSummary, GameOutcome, GameResult } from "@teambrewer/shared";

/** Human labels for a game outcome (from the viewer's / our perspective). */
export const OUTCOME_LABELS: Record<GameOutcome, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
};

/** Tailwind badge classes per outcome — green win, red loss, muted draw. */
export const OUTCOME_BADGE_CLASS: Record<GameOutcome, string> = {
  win: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  loss: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  draw: "bg-muted text-muted-foreground",
};

/** The games-won line for a result, e.g. `2–1`. */
export function formatScore(result: GameResult): string {
  return `${result.gamesWonA}–${result.gamesWonB}`;
}

/**
 * A compact opponent label for a recent-results row. The dashboard reads lean
 * summaries (no resolved deck/hero names), so it prefers the free-text identifiers
 * and falls back to a neutral label; the row deep-links to the game for full detail.
 */
export function opponentSummary(sideB: GameLogSummary["sideB"]): string {
  return sideB.externalOpponentName ?? sideB.archetypeLabel ?? "Recorded opponent";
}

/** A short, locale-independent event date (e.g. `Sep 12, 2026`). */
export function formatEventDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
