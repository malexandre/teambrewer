import type { CardSummary } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CardPicker } from "@/features/cards/CardPicker";
import { ApiError } from "@/lib/api-client";

import { useCreateSuggestion } from "./use-suggestion-mutations";

/**
 * Compose a card-test suggestion for a deck: pick the card to test (required) and an
 * optional card to cut via the shared card autocomplete, add reasoning, and submit.
 * Cards come from the card DB (ADR-0002 — no stored deck list). Closes on success.
 */
export function SuggestionForm({
  teamId,
  deckId,
  onDone,
}: {
  teamId: string | undefined;
  deckId: string;
  onDone: () => void;
}) {
  const [cardIn, setCardIn] = useState<CardSummary | null>(null);
  const [cardOut, setCardOut] = useState<CardSummary | null>(null);
  const [reasoning, setReasoning] = useState("");
  const createSuggestion = useCreateSuggestion(teamId);

  const canSubmit = cardIn !== null && reasoning.trim().length > 0 && !createSuggestion.isPending;

  function submit() {
    if (!cardIn) return;
    createSuggestion.mutate(
      {
        deckId,
        cardInId: cardIn.id,
        ...(cardOut ? { cardOutId: cardOut.id } : {}),
        reasoning: reasoning.trim(),
      },
      {
        onSuccess: () => {
          setCardIn(null);
          setCardOut(null);
          setReasoning("");
          onDone();
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-input p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">Card to test</span>
        {cardIn ? (
          <SelectedCard card={cardIn} onClear={() => setCardIn(null)} />
        ) : (
          <CardPicker teamId={teamId} onSelect={setCardIn} placeholder="Search a card to test…" />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">Card to cut (optional)</span>
        {cardOut ? (
          <SelectedCard card={cardOut} onClear={() => setCardOut(null)} />
        ) : (
          <CardPicker teamId={teamId} onSelect={setCardOut} placeholder="Search a card to cut…" />
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Reasoning</span>
        <textarea
          className="min-h-20 rounded-md border border-input bg-background p-2 text-sm"
          value={reasoning}
          onChange={(event) => setReasoning(event.target.value)}
          placeholder="Why is this worth testing?"
        />
      </label>

      {createSuggestion.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {createSuggestion.error instanceof ApiError
            ? createSuggestion.error.message
            : "Could not save the suggestion."}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          Propose
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SelectedCard({ card, onClear }: { card: CardSummary; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-input px-2 py-1 text-sm">
      <span>{card.name}</span>
      <button type="button" className="text-xs text-muted-foreground underline" onClick={onClear}>
        Change
      </button>
    </div>
  );
}
