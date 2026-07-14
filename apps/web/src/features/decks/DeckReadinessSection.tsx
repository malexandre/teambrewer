import type { BadgeTone } from "@/components/ui/badge";
import type { DeckMetaReadinessRow } from "@teambrewer/shared";
import { META_TIER_LABELS } from "@teambrewer/shared";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { useHeroes } from "@/features/cards/use-heroes";
import { matchupSubjectDisplayName, META_TIER_TONE } from "@/features/metas/meta-display";

import { useDeckMetaReadiness } from "./use-meta-readiness";

/** Confidence bucket → pastel badge tone + label: low/medium data is "thin" (red/
 *  amber), a high bucket is "solid" (green) so the indicator reads as a full scale. */
const TRUST_BADGE: Record<
  DeckMetaReadinessRow["trustIndicator"],
  { tone: BadgeTone; label: string }
> = {
  low: { tone: "danger", label: "thin data" },
  medium: { tone: "warning", label: "thin data" },
  high: { tone: "success", label: "solid data" },
};

/** Format a 0–1 weighted win rate as a percentage, or an em dash when there is none. */
function formatWinRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/**
 * A single readiness row: opponent label + a tier badge, the confidence-weighted win
 * rate with its raw sample, a trust badge (thin/solid data), and the game-plan state.
 * A Tier-1 (`meta_defining`) matchup with no game-plan surfaces a "Needs a plan" pill
 * — the field's defining decks must have a plan.
 */
function ReadinessRow({
  row,
  opponentLabel,
}: {
  row: DeckMetaReadinessRow;
  opponentLabel: string;
}) {
  const trust = TRUST_BADGE[row.trustIndicator];
  const needsPlan = row.tier === "meta_defining" && !row.hasGamePlan;

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium">{opponentLabel}</span>
        <Badge tone={META_TIER_TONE[row.tier]} size="sm" dot className="self-start">
          {META_TIER_LABELS[row.tier]}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums">
          {formatWinRate(row.weightedWinRate)}
          <span className="text-muted-foreground"> · N {row.rawSampleCount}</span>
        </span>
        <Badge tone={trust.tone}>{trust.label}</Badge>
        {needsPlan ? (
          <Badge tone="danger" title="A meta-defining deck must have a game-plan">
            Needs a plan
          </Badge>
        ) : row.hasGamePlan ? (
          <span className="text-xs text-muted-foreground" title="A game-plan exists">
            plan ✓
          </span>
        ) : (
          <span className="text-xs text-muted-foreground" title="No game-plan yet">
            plan ✗
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * The per-deck **Readiness** section on the deck detail: how ready this deck is against
 * each deck in the meta (confidence-weighted win rate + raw sample + a thin-data badge,
 * and whether a game-plan exists). Reuses the kept matchup math server-side; the meta
 * defaults to the most recent one of the deck's format on the server. Empty / no-meta
 * states are handled gracefully.
 */
export function DeckReadinessSection({
  teamId,
  deckId,
}: {
  teamId: string | undefined;
  deckId: string;
}) {
  const { data, isPending, isError } = useDeckMetaReadiness(teamId, deckId);
  const { data: heroData } = useHeroes(teamId);
  const heroNamesById = useMemo(
    () => new Map((heroData?.data ?? []).map((hero) => [hero.id, hero.name])),
    [heroData],
  );

  /**
   * Always lead with the hero name (from the resolved hero list), then the label. While
   * the hero list is still loading for a hero-carrying entry, fall back to the server's
   * stored snapshot label so the row is never blank.
   */
  function opponentLabelForRow(row: DeckMetaReadinessRow): string {
    if (row.heroId) {
      const heroName = heroNamesById.get(row.heroId);
      if (!heroName) {
        return row.opponentSnapshotLabel;
      }
      return matchupSubjectDisplayName(heroName, row.label);
    }
    return matchupSubjectDisplayName(null, row.label);
  }

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
            <ReadinessRow
              key={row.metaDeckEntryId}
              row={row}
              opponentLabel={opponentLabelForRow(row)}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}
