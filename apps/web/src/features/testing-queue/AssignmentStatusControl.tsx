import { allowedNextTestAssignmentStatuses, type TestAssignmentStatus } from "@teambrewer/shared";

import { ASSIGNMENT_STATUS_LABELS, SELECT_CLASS } from "./testing-queue-display";

/**
 * Shows an assignment's status and offers only the transitions the lifecycle permits
 * (allowedNextTestAssignmentStatuses — shared with the server validator, so the
 * control never offers a move the API would reject).
 */
export function AssignmentStatusControl({
  status,
  onChange,
  disabled,
}: {
  status: TestAssignmentStatus;
  onChange: (next: TestAssignmentStatus) => void;
  disabled?: boolean;
}) {
  const nextStatuses = allowedNextTestAssignmentStatuses(status);
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
        {ASSIGNMENT_STATUS_LABELS[status]}
      </span>
      <select
        className={SELECT_CLASS}
        value=""
        disabled={disabled || nextStatuses.length === 0}
        aria-label="Change status"
        onChange={(event) => {
          const next = event.target.value as TestAssignmentStatus | "";
          if (next) onChange(next);
        }}
      >
        <option value="">Change status…</option>
        {nextStatuses.map((next) => (
          <option key={next} value={next}>
            {ASSIGNMENT_STATUS_LABELS[next]}
          </option>
        ))}
      </select>
    </div>
  );
}
