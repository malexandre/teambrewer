import type { Decision } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";

import { useCreateDecision, useUpdateDecision } from "./use-decision-mutations";

/**
 * Create/edit form for a decision: title, context, decision, rationale. A polymorphic
 * `relatedSubjectRef` is out of scope for this inline editor (it is set via the API and
 * displayed read-only); the form focuses on the four prose fields.
 */
export function DecisionEditor({
  teamId,
  existing,
  onDone,
}: {
  teamId: string | undefined;
  existing?: Decision;
  onDone: () => void;
}) {
  const isEdit = existing !== undefined;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [context, setContext] = useState(existing?.context ?? "");
  const [decision, setDecision] = useState(existing?.decision ?? "");
  const [rationale, setRationale] = useState(existing?.rationale ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  const create = useCreateDecision(teamId);
  const update = useUpdateDecision(teamId, existing?.id ?? "");
  const pending = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setValidationError(null);
    if (
      title.trim().length === 0 ||
      context.trim().length === 0 ||
      decision.trim().length === 0 ||
      rationale.trim().length === 0
    ) {
      setValidationError("Title, context, decision, and rationale are all required.");
      return;
    }
    const input = { title, context, decision, rationale };
    if (isEdit) {
      update.mutate(input, { onSuccess: onDone });
    } else {
      create.mutate(input, { onSuccess: onDone });
    }
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      onSubmit={handleSubmit}
      aria-label={isEdit ? "Edit decision" : "Record a decision"}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="decision-title">Title</Label>
        <Input
          id="decision-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Register Fai for Nationals"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="decision-context">Context</Label>
        <textarea
          id="decision-context"
          className="min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm"
          value={context}
          onChange={(event) => setContext(event.target.value)}
          placeholder="The situation or question."
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="decision-decision">Decision</Label>
        <textarea
          id="decision-decision"
          className="min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm"
          value={decision}
          onChange={(event) => setDecision(event.target.value)}
          placeholder="What was chosen."
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="decision-rationale">Rationale</Label>
        <textarea
          id="decision-rationale"
          className="min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm"
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          placeholder="Why."
        />
      </div>

      {validationError ? (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      ) : null}
      {mutationError ? (
        <p role="alert" className="text-sm text-destructive">
          {mutationError instanceof ApiError
            ? mutationError.message
            : "Could not save the decision."}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {isEdit ? "Save" : "Record decision"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
