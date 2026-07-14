import type { DeckDetail } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CardRichText } from "@/features/cards/CardRichText";
import { MentionComposer } from "@/features/collaboration/MentionComposer";
import { ApiError } from "@/lib/api-client";

import { useUpdateDeck } from "./use-deck-mutations";

/**
 * The deck's free-form notes. Rendered with {@link CardRichText} so inline
 * `+[[cardId]]` tokens resolve to card chips, and edited (when permitted) through
 * the shared {@link MentionComposer} with `+card` mentions on — mirroring how
 * game-plan bodies and task descriptions link cards inline. Editing saves a
 * notes-only deck update; archived/read-only decks show the rendered notes only.
 */
export function DeckNotesSection({
  teamId,
  deck,
  canEdit,
}: {
  teamId: string | undefined;
  deck: DeckDetail;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const updateDeck = useUpdateDeck(teamId, deck.id);

  return (
    <section className="flex flex-col gap-2" aria-label="Notes">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Notes</h3>
        {canEdit && !editing ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            {deck.notes ? "Edit notes" : "Add notes"}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <MentionComposer
          teamId={teamId}
          initialValue={deck.notes}
          submitLabel="Save notes"
          placeholder="Sideboard reminders, tech choices, matchup nuance… Use + to link a card, @ to mention a teammate."
          ariaLabel="Deck notes"
          isPending={updateDeck.isPending}
          enableCardMentions
          onSubmit={(body) =>
            updateDeck.mutate({ notes: body }, { onSuccess: () => setEditing(false) })
          }
          onCancel={() => setEditing(false)}
        />
      ) : deck.notes ? (
        <CardRichText teamId={teamId} body={deck.notes} className="whitespace-pre-wrap text-sm" />
      ) : (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      )}

      {updateDeck.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {updateDeck.error instanceof ApiError
            ? updateDeck.error.message
            : "Could not save the notes."}
        </p>
      ) : null}
    </section>
  );
}
