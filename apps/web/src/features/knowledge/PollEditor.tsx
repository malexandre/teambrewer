import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";

import { useCreatePoll } from "./use-poll-mutations";

/**
 * Create form for a poll: a question, two or more option labels (add/remove rows), and an
 * optional close date/time. Editing existing options is handled server-side (and only
 * before votes exist), so this form is create-only.
 */
export function PollEditor({ teamId, onDone }: { teamId: string | undefined; onDone: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [closesAt, setClosesAt] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const create = useCreatePoll(teamId);

  function setOption(index: number, value: string) {
    setOptions((current) =>
      current.map((option, position) => (position === index ? value : option)),
    );
  }
  function addOption() {
    setOptions((current) => [...current, ""]);
  }
  function removeOption(index: number) {
    setOptions((current) => current.filter((_, position) => position !== index));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setValidationError(null);
    const labels = options.map((option) => option.trim()).filter((option) => option.length > 0);
    if (question.trim().length === 0) {
      setValidationError("A poll needs a question.");
      return;
    }
    if (labels.length < 2) {
      setValidationError("A poll needs at least two options.");
      return;
    }
    if (new Set(labels).size !== labels.length) {
      setValidationError("Poll options must be distinct.");
      return;
    }
    create.mutate(
      {
        question,
        options: labels,
        ...(closesAt ? { closesAt: new Date(closesAt).toISOString() } : {}),
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      onSubmit={handleSubmit}
      aria-label="New poll"
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="poll-question">Question</Label>
        <Input
          id="poll-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="e.g. Which deck for Nationals?"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Options</legend>
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={`Option ${index + 1}`}
              value={option}
              onChange={(event) => setOption(index, event.target.value)}
              placeholder={`Option ${index + 1}`}
            />
            {options.length > 2 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeOption(index)}
                aria-label={`Remove option ${index + 1}`}
              >
                Remove
              </Button>
            ) : null}
          </div>
        ))}
        <div>
          <Button type="button" size="sm" variant="outline" onClick={addOption}>
            Add option
          </Button>
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        <Label htmlFor="poll-closes-at">Closes at (optional)</Label>
        <Input
          id="poll-closes-at"
          type="datetime-local"
          value={closesAt}
          onChange={(event) => setClosesAt(event.target.value)}
        />
      </div>

      {validationError ? (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      ) : null}
      {create.error ? (
        <p role="alert" className="text-sm text-destructive">
          {create.error instanceof ApiError ? create.error.message : "Could not create the poll."}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={create.isPending}>
          Create poll
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onDone}
          disabled={create.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
