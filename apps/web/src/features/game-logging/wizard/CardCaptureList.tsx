import { type CardSummary, type GameLogCardInput, type GameLogCardSide } from "@teambrewer/shared";

import { Button } from "@/components/ui/button";
import { CardPicker } from "@/features/cards/CardPicker";

import { GAME_LOG_CARD_SIDE_LABELS } from "../game-display";

/** Names + tags a set of captured cards for one role (impressive/underperforming). */
export function CardCaptureList({
  teamId,
  label,
  value,
  onChange,
  onCapture,
  nameOf,
}: {
  teamId: string | undefined;
  label: string;
  value: GameLogCardInput[];
  onChange: (next: GameLogCardInput[]) => void;
  /** Lets the container remember the card's display name for later rendering. */
  onCapture: (card: CardSummary) => void;
  nameOf: (cardId: string) => string;
}) {
  function add(card: CardSummary) {
    onCapture(card);
    if (value.some((entry) => entry.cardId === card.id)) return;
    onChange([...value, { cardId: card.id, side: "ours" }]);
  }
  function setSide(cardId: string, side: GameLogCardSide) {
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
              {(["ours", "theirs"] as GameLogCardSide[]).map((side) => (
                <Button
                  key={side}
                  type="button"
                  size="sm"
                  variant={entry.side === side ? "default" : "outline"}
                  aria-pressed={entry.side === side}
                  onClick={() => setSide(entry.cardId, side)}
                >
                  {GAME_LOG_CARD_SIDE_LABELS[side]}
                </Button>
              ))}
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
