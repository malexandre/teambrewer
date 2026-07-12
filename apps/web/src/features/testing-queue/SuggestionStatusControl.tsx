import {
  allowedNextCardTestSuggestionStatuses,
  type CardTestSuggestionStatus,
  cardTestSuggestionStatusRequiresResolutionNote,
} from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { SELECT_CLASS, SUGGESTION_STATUS_LABELS } from "./testing-queue-display";

/**
 * Shows a suggestion's status and offers only the transitions the lifecycle permits
 * (allowedNextCardTestSuggestionStatuses — shared with the server validator). Moving
 * to `adopted`/`rejected` reveals a required resolution note before confirming, so a
 * conclusion is always recorded.
 */
export function SuggestionStatusControl({
  status,
  onChange,
  disabled,
}: {
  status: CardTestSuggestionStatus;
  onChange: (next: CardTestSuggestionStatus, resolutionNote?: string) => void;
  disabled?: boolean;
}) {
  const [pendingResolution, setPendingResolution] = useState<CardTestSuggestionStatus | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const nextStatuses = allowedNextCardTestSuggestionStatuses(status);

  function selectNext(next: CardTestSuggestionStatus | "") {
    if (!next) return;
    if (cardTestSuggestionStatusRequiresResolutionNote(next)) {
      setPendingResolution(next);
      setResolutionNote("");
    } else {
      onChange(next);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
          {SUGGESTION_STATUS_LABELS[status]}
        </span>
        <select
          className={SELECT_CLASS}
          value=""
          disabled={disabled || nextStatuses.length === 0}
          aria-label="Change status"
          onChange={(event) => selectNext(event.target.value as CardTestSuggestionStatus | "")}
        >
          <option value="">Change status…</option>
          {nextStatuses.map((next) => (
            <option key={next} value={next}>
              {SUGGESTION_STATUS_LABELS[next]}
            </option>
          ))}
        </select>
      </div>

      {pendingResolution ? (
        <div className="flex flex-col gap-2 rounded-md border border-input p-2">
          <label htmlFor="resolution-note" className="text-xs font-medium">
            Why {SUGGESTION_STATUS_LABELS[pendingResolution].toLowerCase()}? (required)
          </label>
          <textarea
            id="resolution-note"
            className="min-h-16 rounded-md border border-input bg-background p-2 text-sm"
            value={resolutionNote}
            onChange={(event) => setResolutionNote(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={resolutionNote.trim().length === 0}
              onClick={() => {
                onChange(pendingResolution, resolutionNote.trim());
                setPendingResolution(null);
              }}
            >
              Confirm {SUGGESTION_STATUS_LABELS[pendingResolution].toLowerCase()}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setPendingResolution(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
