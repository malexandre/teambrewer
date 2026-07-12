import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";

import { useAddIterationEntry } from "./use-deck-mutations";
import { useDeckIterations } from "./use-decks";

/**
 * A deck's iteration log: the prose changelog timeline (most-recent first) and,
 * for members who may annotate the deck, an append-only entry form. There is no
 * card list — entries are free text (ADR-0002).
 */
export function IterationLog({
  teamId,
  deckId,
  canAddEntry,
}: {
  teamId: string | undefined;
  deckId: string;
  canAddEntry: boolean;
}) {
  const { data } = useDeckIterations(teamId, deckId);
  const addEntry = useAddIterationEntry(teamId, deckId);
  const [body, setBody] = useState("");

  const entries = data?.data ?? [];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    addEntry.mutate({ body: body.trim() }, { onSuccess: () => setBody("") });
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Iteration log</h3>

      {canAddEntry ? (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <textarea
            className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-sm"
            placeholder="What changed? e.g. -2 Sink Below, +2 Snatch after the event"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-label="New iteration entry"
          />
          {addEntry.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {addEntry.error instanceof ApiError ? addEntry.error.message : "Could not add entry."}
            </p>
          ) : null}
          <div>
            <Button type="submit" size="sm" disabled={addEntry.isPending || !body.trim()}>
              Add entry
            </Button>
          </div>
        </form>
      ) : null}

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No iteration entries yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-md border border-border p-2">
              <p className="whitespace-pre-wrap text-sm">{entry.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
