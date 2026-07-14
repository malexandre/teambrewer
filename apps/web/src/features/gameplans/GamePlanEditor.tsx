import type { MatchupGamePlan } from "@teambrewer/shared";
import { useState } from "react";

import { MentionComposer } from "@/features/collaboration/MentionComposer";
import { HeroPicker } from "@/features/decks/HeroPicker";
import { useIdentityLabel } from "@/features/game-logging/use-game-config";
import { ApiError } from "@/lib/api-client";

import { useCreateGamePlan, useUpdateGamePlan } from "./use-game-plan-mutations";

/**
 * Create/edit form for a matchup game-plan, surfaced from the deck detail page. On
 * create it names the opponent as a matchup subject — a required free-text archetype
 * label with an optional hero qualifier — plus the body. On edit the matchup key is
 * immutable (server-enforced), so only the body changes. Key cards are referenced
 * inline in the body via the shared {@link MentionComposer} with `+card` mentions on
 * (type `+` to link a card) — there is no separate structured key-card strip (WS-4).
 * The composer's submit is the form's submit; the body carries the plan.
 */
export function GamePlanEditor({
  teamId,
  deckId,
  formatId,
  existing,
  onDone,
}: {
  teamId: string | undefined;
  deckId: string;
  formatId: string;
  existing?: MatchupGamePlan;
  onDone: () => void;
}) {
  const isEdit = existing !== undefined;
  const identityLabel = useIdentityLabel(teamId);
  const [heroId, setHeroId] = useState("");
  const [archetypeLabel, setArchetypeLabel] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  // The body lives in the composer (uncontrolled); mirror the last submitted value so a
  // validation/API failure can re-seed a remounted composer instead of dropping the text.
  const [draftBody, setDraftBody] = useState(existing?.body ?? "");
  const [composerKey, setComposerKey] = useState(0);

  const create = useCreateGamePlan(teamId);
  const update = useUpdateGamePlan(teamId, existing?.id ?? "");
  const pending = create.isPending || update.isPending;

  function restoreComposer(body: string) {
    setDraftBody(body);
    setComposerKey((key) => key + 1);
  }

  function handleSubmit(body: string) {
    setValidationError(null);

    if (isEdit) {
      update.mutate({ body }, { onSuccess: onDone, onError: () => restoreComposer(body) });
      return;
    }

    if (archetypeLabel.trim().length === 0) {
      setValidationError("Enter an archetype label for the matchup.");
      restoreComposer(body);
      return;
    }

    create.mutate(
      {
        ourDeckId: deckId,
        formatId,
        body,
        opponentArchetypeLabel: archetypeLabel.trim(),
        ...(heroId ? { opponentHeroId: heroId } : {}),
      },
      { onSuccess: onDone, onError: () => restoreComposer(body) },
    );
  }

  const mutationError = create.error ?? update.error;

  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      aria-label={isEdit ? "Edit game-plan" : "New game-plan"}
    >
      {!isEdit ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Opponent</span>
          <input
            type="text"
            aria-label="Archetype label"
            className="w-full rounded-md border border-input bg-background p-2 text-sm"
            value={archetypeLabel}
            onChange={(event) => setArchetypeLabel(event.target.value)}
            placeholder="e.g. Aggro Fai"
          />
          <span className="text-xs text-muted-foreground">{identityLabel} (optional)</span>
          <HeroPicker teamId={teamId} value={heroId} onChange={setHeroId} id="game-plan-hero" />
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Plan</span>
        <MentionComposer
          key={composerKey}
          teamId={teamId}
          initialValue={draftBody}
          submitLabel={isEdit ? "Save" : "Create game-plan"}
          placeholder="Mulligan priorities, key sequencing, lines… Use + to link a card, @ to mention a teammate."
          ariaLabel="Plan"
          isPending={pending}
          enableCardMentions
          onSubmit={handleSubmit}
          onCancel={onDone}
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
            : "Could not save the game-plan."}
        </p>
      ) : null}
    </div>
  );
}
