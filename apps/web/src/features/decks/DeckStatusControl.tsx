import { allowedNextDeckStatuses, type DeckStatus } from "@teambrewer/shared";

import { Badge } from "@/components/ui/badge";

import { DECK_STATUS_LABELS, DECK_STATUS_TONE, SELECT_CLASS } from "./deck-display";

/**
 * Shows a deck's current status and offers only the transitions the lifecycle
 * permits from it (allowedNextDeckStatuses — shared with the server validator, so
 * the control never offers a move the API would reject).
 */
export function DeckStatusControl({
  status,
  onChange,
  disabled,
}: {
  status: DeckStatus;
  onChange: (next: DeckStatus) => void;
  disabled?: boolean;
}) {
  const nextStatuses = allowedNextDeckStatuses(status);
  return (
    <div className="flex items-center gap-2">
      <Badge tone={DECK_STATUS_TONE[status]} dot>
        {DECK_STATUS_LABELS[status]}
      </Badge>
      <select
        className={SELECT_CLASS}
        value=""
        disabled={disabled || nextStatuses.length === 0}
        aria-label="Change status"
        onChange={(event) => {
          const next = event.target.value as DeckStatus | "";
          if (next) onChange(next);
        }}
      >
        <option value="">Change status…</option>
        {nextStatuses.map((next) => (
          <option key={next} value={next}>
            {DECK_STATUS_LABELS[next]}
          </option>
        ))}
      </select>
    </div>
  );
}
