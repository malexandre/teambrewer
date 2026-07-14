import {
  allowedNextTaskStatuses,
  type TaskStatus,
  taskStatusRequiresReport,
} from "@teambrewer/shared";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { SELECT_CLASS, TASK_STATUS_LABELS, TASK_STATUS_TONE } from "./task-display";

/**
 * Shows a task's status and offers only the transitions the lifecycle permits
 * (allowedNextTaskStatuses — shared with the server validator, so the control never
 * offers a move the API would reject). Moving to `finished` reveals a required report
 * before confirming, so a durable conclusion is always recorded.
 */
export function TaskStatusControl({
  status,
  onChange,
  disabled,
}: {
  status: TaskStatus;
  onChange: (next: TaskStatus, report?: string) => void;
  disabled?: boolean;
}) {
  const [pendingFinish, setPendingFinish] = useState<TaskStatus | null>(null);
  const [report, setReport] = useState("");
  const nextStatuses = allowedNextTaskStatuses(status);

  function selectNext(next: TaskStatus | "") {
    if (!next) return;
    if (taskStatusRequiresReport(next)) {
      setPendingFinish(next);
      setReport("");
    } else {
      onChange(next);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Badge tone={TASK_STATUS_TONE[status]} dot>
          {TASK_STATUS_LABELS[status]}
        </Badge>
        <select
          className={SELECT_CLASS}
          value=""
          disabled={disabled || nextStatuses.length === 0}
          aria-label="Change status"
          onChange={(event) => selectNext(event.target.value as TaskStatus | "")}
        >
          <option value="">Change status…</option>
          {nextStatuses.map((next) => (
            <option key={next} value={next}>
              {TASK_STATUS_LABELS[next]}
            </option>
          ))}
        </select>
      </div>

      {pendingFinish ? (
        <div className="flex flex-col gap-2 rounded-md border border-input p-2">
          <label htmlFor="task-report" className="text-xs font-medium">
            What did you find? (required to finish)
          </label>
          <textarea
            id="task-report"
            className="min-h-16 rounded-md border border-input bg-background p-2 text-sm"
            value={report}
            onChange={(event) => setReport(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={report.trim().length === 0}
              onClick={() => {
                onChange(pendingFinish, report.trim());
                setPendingFinish(null);
              }}
            >
              Finish task
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPendingFinish(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
