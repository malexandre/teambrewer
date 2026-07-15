import { type CardSummary, type GameLogCardInput, type GameSide } from "@teambrewer/shared";

import { Button } from "@/components/ui/button";
import { CardPicker } from "@/features/cards/CardPicker";

import { sideToneClassName } from "./SegmentedControl";

/** Names + tags a set of captured cards for one role (impressive/underperforming). */
export function CardCaptureList({
  teamId,
  label,
  value,
  onChange,
  onCapture,
  nameOf,
  sideNames,
}: {
  teamId: string | undefined;
  label: string;
  value: GameLogCardInput[];
  onChange: (next: GameLogCardInput[]) => void;
  /** Lets the container remember the card's display name for later rendering. */
  onCapture: (card: CardSummary) => void;
  nameOf: (cardId: string) => string;
  /** Display name of each game side (hero-first), so a captured card is tagged with
   *  the real subject it belonged to (Deck A / Deck B) rather than "ours/theirs". */
  sideNames: Record<GameSide, string>;
}) {
  function add(card: CardSummary) {
    onCapture(card);
    if (value.some((entry) => entry.cardId === card.id)) return;
    onChange([...value, { cardId: card.id, side: "A" }]);
  }
  function setSide(cardId: string, side: GameSide) {
    onChange(value.map((entry) => (entry.cardId === cardId ? { ...entry, side } : entry)));
  }
  function remove(cardId: string) {
    onChange(value.filter((entry) => entry.cardId !== cardId));
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{label}</legend>
      <CardPicker teamId={teamId} onSelect={add} placeholder="Search a card…" />
      <ul className="flex flex-col gap-1">
        {value.map((entry) => (
          <li key={entry.cardId} className="flex items-center justify-between gap-2 text-sm">
            <span>{nameOf(entry.cardId)}</span>
            <span className="flex items-center gap-1">
              {/* Reuse the form's side colour code (blue Deck A / red Deck B) so the
                  owner is unambiguous even in a mirror where both labels read the same;
                  the active button also gets the primary ring. Mirrors StepResult. */}
              {(["A", "B"] as GameSide[]).map((side) => {
                const isActive = entry.side === side;
                return (
                  <Button
                    key={side}
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-pressed={isActive}
                    className={sideToneClassName(side === "A" ? "sideA" : "sideB", isActive)}
                    onClick={() => setSide(entry.cardId, side)}
                  >
                    {sideNames[side]}
                  </Button>
                );
              })}
              <Button type="button" size="sm" variant="ghost" onClick={() => remove(entry.cardId)}>
                Remove
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
