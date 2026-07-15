import type { DeckCardObservation } from "@teambrewer/shared";
import { Sparkles } from "lucide-react";

import { Section } from "@/components/ui/section";
import { CardResultRow } from "@/features/cards/CardResultRow";
import { cn } from "@/lib/utils";

import { useDeckCardObservations } from "./use-deck-card-observations";

/** A count cell: the number in tabular figures, muted when zero so the signal stands out. */
function CountCell({ value, tone }: { value: number; tone: string }) {
  return (
    <td
      className={cn(
        "py-2 pr-3 text-right align-middle font-semibold whitespace-nowrap tabular-nums",
        value === 0 ? "text-muted-foreground" : tone,
      )}
    >
      {value}
    </td>
  );
}

/** Format a signed −1…+1 score as a signed whole percentage (+64%, 0%, −38%). */
function formatScore(score: number): string {
  const percent = Math.round(score * 100);
  return percent > 0 ? `+${percent}%` : `${percent}%`;
}

/**
 * Color the signed score on a diverging 5-level scale: strong keep (green, bold) →
 * keep (green) → neutral (muted) → cut (red) → strong cut (red, bold). Green/red carry
 * the sign; weight adds the extra levels, all from design tokens.
 */
function scoreClass(score: number): string {
  if (score >= 0.4) return "font-bold text-success-foreground";
  if (score >= 0.15) return "font-semibold text-success-foreground";
  if (score <= -0.4) return "font-bold text-danger-foreground";
  if (score <= -0.15) return "font-semibold text-danger-foreground";
  return "font-medium text-muted-foreground";
}

/** One card row: the card (art + name + pitch), its keep/cut score, and its two counts. */
function ObservationRow({ observation }: { observation: DeckCardObservation }) {
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="w-full py-2 pr-3 align-middle">
        <span className="flex items-center justify-between gap-2">
          <CardResultRow card={observation.card} />
        </span>
      </td>
      <td
        className={cn(
          "py-2 pr-3 text-right align-middle whitespace-nowrap tabular-nums",
          scoreClass(observation.score),
        )}
      >
        {formatScore(observation.score)}
      </td>
      <CountCell value={observation.impressiveCount} tone="text-success-foreground" />
      <CountCell value={observation.underperformingCount} tone="text-danger-foreground" />
    </tr>
  );
}

/**
 * The per-deck **Card observations** section on the deck detail: how often each of the
 * deck's own cards was noted impressive vs underperforming across every game relevant to
 * the deck (the deck piloted, or a linked meta deck entry / sibling / matching hero+label
 * on either side). The two counts are shown separately — a card can be both. Derived
 * read-only from the captured `GameLogCard` rows; empty states are handled gracefully.
 */
export function DeckCardObservationsSection({
  teamId,
  deckId,
}: {
  teamId: string | undefined;
  deckId: string;
}) {
  const { data, isPending, isError } = useDeckCardObservations(teamId, deckId);
  const gamesLabel =
    data && data.gamesConsidered > 0
      ? ` · ${data.gamesConsidered} game${data.gamesConsidered === 1 ? "" : "s"}`
      : "";

  return (
    <Section
      title={`Card observations${gamesLabel}`}
      icon={<Sparkles />}
      aria-label="Card observations"
      bodyClassName="gap-2"
    >
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading card observations…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Could not load card observations.</p>
      ) : !data || data.observations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No cards flagged yet. Mark cards impressive or underperforming when logging games to build
          this up.
        </p>
      ) : (
        <div className="overflow-x-auto">
          {/* Card column soaks up the width (w-full); the score + count columns hug their content. */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                <th className="w-full py-2 pr-3 font-medium">Card</th>
                <th className="whitespace-nowrap py-2 pr-3 text-right font-medium">Score</th>
                <th className="whitespace-nowrap py-2 pr-3 text-right font-medium">Impressive</th>
                <th className="whitespace-nowrap py-2 pr-3 text-right font-medium">
                  Underperforming
                </th>
              </tr>
            </thead>
            <tbody>
              {data.observations.map((observation) => (
                <ObservationRow key={observation.card.id} observation={observation} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
