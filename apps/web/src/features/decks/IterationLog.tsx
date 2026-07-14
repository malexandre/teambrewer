import { History } from "lucide-react";

import { Section } from "@/components/ui/section";
import { CardRichText } from "@/features/cards/CardRichText";
import { MentionComposer } from "@/features/collaboration/MentionComposer";
import { ApiError } from "@/lib/api-client";

import { useAddIterationEntry } from "./use-deck-mutations";
import { useDeckIterations } from "./use-decks";

/**
 * A deck's iteration log: the prose changelog timeline (most-recent first) and,
 * for members who may annotate the deck, an append-only entry form. There is no
 * card list — entries are free text (ADR-0002), but they may link cards inline
 * with `+[[cardId]]` tokens via the shared {@link MentionComposer}. Iteration
 * entries are not a mention/notification subject, so `@member` mentions are off;
 * only `+card` links are enabled. Entry bodies render through {@link CardRichText}
 * so those tokens resolve to card chips.
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

  const entries = data?.data ?? [];

  return (
    <Section title="Iteration log" icon={<History />} aria-label="Iteration log">
      {canAddEntry ? (
        <>
          <MentionComposer
            teamId={teamId}
            submitLabel="Add entry"
            placeholder="What changed? e.g. -2 Sink Below, +2 Snatch after the event. Use + to link a card."
            ariaLabel="New iteration entry"
            isPending={addEntry.isPending}
            enableCardMentions
            enableMemberMentions={false}
            onSubmit={(body) => addEntry.mutate({ body })}
          />
          {addEntry.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {addEntry.error instanceof ApiError ? addEntry.error.message : "Could not add entry."}
            </p>
          ) : null}
        </>
      ) : null}

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No iteration entries yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-md border border-border p-2">
              <CardRichText
                teamId={teamId}
                body={entry.body}
                className="whitespace-pre-wrap text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
