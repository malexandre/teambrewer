import type { MatchupCell } from "@teambrewer/shared";

import { cn } from "@/lib/utils";

import {
  TRUST_INDICATOR_BADGE_CLASS,
  TRUST_INDICATOR_LABELS,
  formatEffectiveSample,
  formatWinRate,
} from "./matchup-display";

/**
 * One matchup cell. Raw N and the trust indicator are **always** visible next to
 * the weighted win rate (never hidden), so a strong rate over a thin sample reads
 * as tentative. Used both in the matrix grid and inline in the coverage tracker.
 */
export function MatchupCellView({ cell }: { cell: MatchupCell }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-base font-semibold tabular-nums">
        {formatWinRate(cell.weightedWinRate)}
      </span>
      <span
        className={cn(
          "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
          TRUST_INDICATOR_BADGE_CLASS[cell.trustIndicator],
        )}
        title={`Effective sample ${formatEffectiveSample(cell.effectiveSample)}`}
      >
        {TRUST_INDICATOR_LABELS[cell.trustIndicator]}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">N={cell.rawSampleCount}</span>
    </div>
  );
}

/** The placeholder for an untested (row, column) intersection. */
export function EmptyMatchupCell() {
  return <span className="text-sm text-muted-foreground">—</span>;
}
