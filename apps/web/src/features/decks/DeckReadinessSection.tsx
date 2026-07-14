import type { DeckMetaReadinessRow } from "@teambrewer/shared";
import { META_TIER_LABELS } from "@teambrewer/shared";

import { Section } from "@/components/ui/section";

import { useDeckMetaReadiness } from "./use-meta-readiness";

/** Format a 0–1 weighted win rate as a percentage, or an em dash when there is none. */
function formatWinRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/**
 * A single readiness row: opponent label + tier, the confidence-weighted win rate with
 * its raw sample, a thin-data badge below `high` trust, and a plan ✓/✗. A Tier-1
 * (`meta_defining`) matchup with no game-plan is flagged (destructive) — the field's
 * defining decks must have a plan.
 */
function ReadinessRow({ row }: { row: DeckMetaReadinessRow }) {
  const isThin = row.trustIndicator !== "high";
  const isUnplannedTierOne = row.tier === "meta_defining" && !row.hasGamePlan;

  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm ${
        isUnplannedTierOne ? "border-destructive/60" : "border-border"
      }`}
    >
      <div className="flex flex-col">
        <span className="font-medium">{row.opponentSnapshotLabel}</span>
        <span className="text-xs text-muted-foreground">{META_TIER_LABELS[row.tier]}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums">
          {formatWinRate(row.weightedWinRate)}
          <span className="text-muted-foreground"> · N {row.rawSampleCount}</span>
        </span>
        {isThin ? (
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            thin data
          </span>
        ) : null}
        {row.hasGamePlan ? (
          <span className="text-xs text-muted-foreground" title="A game-plan exists">
            plan ✓
          </span>
        ) : (
          <span
            className={`text-xs ${isUnplannedTierOne ? "text-destructive" : "text-muted-foreground"}`}
            title="No game-plan yet"
          >
            plan ✗
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * The per-deck **Readiness** section on the deck detail: how ready this deck is against
 * each deck in the current meta (confidence-weighted win rate + raw sample + a thin-data
 * badge, and whether a game-plan exists). Reuses the kept matchup math server-side; the
 * "current meta" defaults on the server. Empty / no-current-meta states are handled
 * gracefully.
 */
export function DeckReadinessSection({
  teamId,
  deckId,
}: {
  teamId: string | undefined;
  deckId: string;
}) {
  const { data, isPending, isError } = useDeckMetaReadiness(teamId, deckId);

  return (
    <Section
      title={`Readiness${data && data.metaName ? ` · ${data.metaName}` : ""}`}
      aria-label="Meta readiness"
      bodyClassName="gap-2"
    >
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading readiness…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Could not load readiness.</p>
      ) : !data || data.metaId === "" ? (
        <p className="text-sm text-muted-foreground">
          No current meta. Create a meta with a tiered deck list to track readiness.
        </p>
      ) : data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">This meta has no decks yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.rows.map((row) => (
            <ReadinessRow key={row.metaDeckEntryId} row={row} />
          ))}
        </ul>
      )}
    </Section>
  );
}
