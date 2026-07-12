import { allowedNextEventStatuses, type EventStatus } from "@teambrewer/shared";

import { EVENT_STATUS_LABELS, SELECT_CLASS } from "./event-display";

/**
 * Shows an event's current status and offers only the transitions the lifecycle
 * permits from it (allowedNextEventStatuses — shared with the server validator, so
 * the control never offers a move the API would reject).
 */
export function EventStatusControl({
  status,
  onChange,
  disabled,
}: {
  status: EventStatus;
  onChange: (next: EventStatus) => void;
  disabled?: boolean;
}) {
  const nextStatuses = allowedNextEventStatuses(status);
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
        {EVENT_STATUS_LABELS[status]}
      </span>
      <select
        className={SELECT_CLASS}
        value=""
        disabled={disabled || nextStatuses.length === 0}
        aria-label="Change status"
        onChange={(event) => {
          const next = event.target.value as EventStatus | "";
          if (next) onChange(next);
        }}
      >
        <option value="">Change status…</option>
        {nextStatuses.map((next) => (
          <option key={next} value={next}>
            {EVENT_STATUS_LABELS[next]}
          </option>
        ))}
      </select>
    </div>
  );
}
