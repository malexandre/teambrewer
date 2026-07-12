import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useDecks } from "@/features/decks/use-decks";
import { useActiveTeam } from "@/features/teams/active-team";
import { ApiError } from "@/lib/api-client";

import { SELECT_CLASS } from "../decks/deck-display";
import {
  useEventDeckSelections,
  useLockDeckSelection,
  useSetMyDeckSelection,
  useUnlockDeckSelection,
} from "./use-deck-selections";

/**
 * Per-event deck selection on the event hub: a compact "My pick" card (deck + reasoning)
 * plus the team roster with each member's pick and lock state. A member edits only their
 * own selection while unlocked; a team-admin locks/unlocks any. A warning (not a block)
 * shows when the chosen deck's format differs from the event's.
 */
export function DeckSelectionSection({
  teamId,
  eventId,
  eventFormatId,
}: {
  teamId: string | undefined;
  eventId: string;
  eventFormatId: string;
}) {
  const { data: user } = useCurrentUser();
  const { activeTeam } = useActiveTeam();
  const isTeamAdmin = activeTeam?.role === "team_admin";
  const { data: roster, isPending } = useEventDeckSelections(teamId, eventId);
  const { data: deckData } = useDecks(teamId, {});
  const setMine = useSetMyDeckSelection(teamId, eventId);
  const lock = useLockDeckSelection(teamId, eventId);
  const unlock = useUnlockDeckSelection(teamId, eventId);

  const decks = deckData?.data ?? [];
  const selections = roster?.data ?? [];
  const mine = selections.find((selection) => selection.member.userId === user?.id);

  const [deckId, setDeckId] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [editing, setEditing] = useState(false);

  function startEditing() {
    setDeckId(mine?.deckId ?? "");
    setReasoning(mine?.reasoning ?? "");
    setEditing(true);
  }

  function save() {
    if (deckId === "") return;
    setMine.mutate({ deckId, reasoning }, { onSuccess: () => setEditing(false) });
  }

  const chosenDeck = decks.find((deck) => deck.id === deckId);
  const formatMismatch = chosenDeck !== undefined && chosenDeck.formatId !== eventFormatId;
  const mineLocked = mine?.locked ?? false;

  return (
    <section className="flex flex-col gap-3" aria-label="Deck selection">
      <h3 className="text-sm font-semibold">Deck selection</h3>

      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">My pick</span>
          {mineLocked ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs" aria-label="Locked">
              🔒 Locked
            </span>
          ) : null}
        </div>

        {editing && !mineLocked ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="deck-selection-deck">Deck</Label>
              <select
                id="deck-selection-deck"
                className={SELECT_CLASS}
                value={deckId}
                onChange={(event) => setDeckId(event.target.value)}
                aria-label="Deck"
              >
                <option value="">— Choose a deck —</option>
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
            </div>
            {formatMismatch ? (
              <p role="alert" className="text-sm text-amber-600 dark:text-amber-500">
                This deck's format differs from the event's format. You can still pick it.
              </p>
            ) : null}
            <div className="flex flex-col gap-1">
              <Label htmlFor="deck-selection-reasoning">Reasoning</Label>
              <textarea
                id="deck-selection-reasoning"
                className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-sm"
                value={reasoning}
                onChange={(event) => setReasoning(event.target.value)}
                placeholder="Why this deck for this event?"
              />
            </div>
            {setMine.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {setMine.error instanceof ApiError
                  ? setMine.error.message
                  : "Could not save your pick."}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={setMine.isPending || deckId === ""}
                onClick={save}
              >
                Save my pick
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : mine ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>
              {mine.deckName}
              {mine.reasoning ? ` — ${mine.reasoning}` : ""}
            </span>
            {!mineLocked ? (
              <Button type="button" size="sm" variant="outline" onClick={startEditing}>
                Change
              </Button>
            ) : null}
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={startEditing}>
            Record my pick
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Team roster
        </h4>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading roster…</p>
        ) : selections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No selections yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {selections.map((selection) => (
              <li key={selection.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {selection.member.displayName}: {selection.deckName}
                  {selection.locked ? " 🔒" : ""}
                </span>
                {isTeamAdmin ? (
                  selection.locked ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={unlock.isPending}
                      onClick={() => unlock.mutate(selection.id)}
                    >
                      Unlock
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={lock.isPending}
                      onClick={() => lock.mutate(selection.id)}
                    >
                      Lock
                    </Button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
