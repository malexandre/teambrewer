import { allowedNextDeckStatuses, type DeckStatus } from "@teambrewer/shared";

import { DECK_STATUS_LABELS, SELECT_CLASS } from "./deck-display";

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
      <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
        {DECK_STATUS_LABELS[status]}
      </span>
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
