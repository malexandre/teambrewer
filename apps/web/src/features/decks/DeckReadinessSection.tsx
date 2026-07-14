import type { BadgeTone } from "@/components/ui/badge";
import type { DeckMetaReadinessRow } from "@teambrewer/shared";
import { META_TIER_LABELS } from "@teambrewer/shared";
import { Gauge } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { useHeroes } from "@/features/cards/use-heroes";
import { matchupSubjectDisplayName, META_TIER_TONE } from "@/features/metas/meta-display";
import { cn } from "@/lib/utils";

import { useDeckMetaReadiness } from "./use-meta-readiness";

/** Confidence bucket → pastel badge tone + label: low/medium data is "thin" (red/
 *  amber), a high bucket is "solid" (green) so the indicator reads as a full scale. */
const TRUST_BADGE: Record<
  DeckMetaReadinessRow["trustIndicator"],
  { tone: BadgeTone; label: string }
> = {
  low: { tone: "danger", label: "Thin data" },
  medium: { tone: "warning", label: "Thin data" },
  high: { tone: "success", label: "Solid data" },
};

/** Format a 0–1 weighted win rate as a percentage, or an em dash when there is none. */
function formatWinRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/** Color the win rate by favorability: green ≥55%, red ≤45%, neutral in between. */
function winRateToneClass(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate >= 0.55) return "text-success-foreground";
  if (rate <= 0.45) return "text-danger-foreground";
  return "";
}

/**
 * A single readiness table row: tier rank, the matchup subject (hero · label), the
 * confidence-weighted win rate, the raw sample size, a trust badge (thin/solid data),
 * and the game-plan state. A Tier-1 (`meta_defining`) matchup with no game-plan
 * surfaces a "Needs a plan" pill — the field's defining decks must have a plan.
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
    <tr className="border-b border-border/60 last:border-0">
      <td className="py-2 pr-3 align-middle">
        <Badge tone={META_TIER_TONE[row.tier]} size="sm" className="whitespace-normal">
          {META_TIER_LABELS[row.tier]}
        </Badge>
      </td>
      <td className="truncate py-2 pr-3 align-middle font-medium" title={opponentLabel}>
        {opponentLabel}
      </td>
      <td
        className={cn(
          "py-2 pr-3 text-right align-middle font-semibold tabular-nums",
          winRateToneClass(row.weightedWinRate),
        )}
      >
        {formatWinRate(row.weightedWinRate)}
      </td>
      <td className="py-2 pr-3 text-right align-middle tabular-nums text-muted-foreground">
        {row.rawSampleCount}
      </td>
      <td className="py-2 pr-3 align-middle">
        <Badge tone={trust.tone} size="sm">
          {trust.label}
        </Badge>
      </td>
      <td className="py-2 text-center align-middle">
        {row.hasGamePlan ? (
          <span
            role="img"
            aria-label="Has a game-plan"
            title="Has a game-plan"
            className="text-base font-bold text-success-foreground"
          >
            ✓
          </span>
        ) : (
          <span
            role="img"
            aria-label={needsPlan ? "Needs a plan" : "No game-plan"}
            title={
              needsPlan ? "Needs a plan (a meta-defining deck should have one)" : "No game-plan"
            }
            className="text-base font-bold text-danger-foreground"
          >
            ✗
          </span>
        )}
      </td>
    </tr>
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
      icon={<Gauge />}
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
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col style={{ width: "116px" }} />
              <col />
              <col style={{ width: "64px" }} />
              <col style={{ width: "56px" }} />
              <col style={{ width: "108px" }} />
              <col style={{ width: "52px" }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Rank</th>
                <th className="py-2 pr-3 font-medium">Matchup</th>
                <th className="py-2 pr-3 text-right font-medium">Win rate</th>
                <th className="py-2 pr-3 text-right font-medium">Games</th>
                <th className="py-2 pr-3 font-medium">Confidence</th>
                <th className="py-2 text-center font-medium">Plan</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <ReadinessRow
                  key={row.metaDeckEntryId}
                  row={row}
                  opponentLabel={opponentLabelForRow(row)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
