import { DEFAULT_COVERAGE_MIN_EFFECTIVE_SAMPLE } from "@teambrewer/shared";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { MatchupCellView } from "./MatchupCellView";
import { SELECT_CLASS } from "./matchup-display";
import { type CoverageScope, useMatchupCoverage } from "./use-matchups";

/**
 * The coverage tracker for an event's gauntlet: which matchups are still thin,
 * ordered by expected field share (the bogeyman with high share and low coverage
 * rises to the top). A threshold control re-flags rows; under-covered rows are
 * called out. Assignments link out to the testing queue once phase-08 exists.
 */
export function CoverageTracker({
  teamId,
  eventId,
  byHero,
}: {
  teamId: string | undefined;
  eventId: string | undefined;
  byHero: boolean;
}) {
  const [minEffectiveSample, setMinEffectiveSample] = useState<number>(
    DEFAULT_COVERAGE_MIN_EFFECTIVE_SAMPLE,
  );

  const scope: CoverageScope | undefined = eventId
    ? { eventId, byHero, minEffectiveSample }
    : undefined;
  const { data, isPending, isError } = useMatchupCoverage(teamId, scope);

  if (!eventId) {
    return (
      <p className="text-sm text-muted-foreground">Pick an event to see its gauntlet coverage.</p>
    );
  }
  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading coverage…</p>;
  }
  if (isError) {
    return <p className="text-sm text-destructive">Could not load coverage.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm">
        <span>Flag matchups under an effective sample of</span>
        <select
          className={SELECT_CLASS}
          value={minEffectiveSample}
          onChange={(event) => setMinEffectiveSample(Number(event.target.value))}
          aria-label="Coverage threshold (minimum effective sample)"
        >
          {[2, 5, 10, 15, 20].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      {data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">This event has no gauntlet targets yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.rows.map((row) => (
            <li
              key={row.gauntletEntryId}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-md border p-3",
                row.isUnderCovered
                  ? "border-amber-400/70 bg-amber-50 dark:bg-amber-900/20"
                  : "border-border",
              )}
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{row.opponent.label}</span>
                <span className="text-xs text-muted-foreground">
                  Expected field share {row.expectedMetaShare}% ·{" "}
                  {Math.round(row.normalizedShare * 100)}% of the field
                  {row.isUnderCovered ? " · under-tested" : ""}
                </span>
              </div>
              <MatchupCellView cell={row.aggregate} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
