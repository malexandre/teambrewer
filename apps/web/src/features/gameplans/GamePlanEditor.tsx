import type { CardSummary, MatchupGamePlan } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CardPicker } from "@/features/cards/CardPicker";
import { HeroPicker } from "@/features/decks/HeroPicker";
import { useIdentityLabel } from "@/features/game-logging/use-game-config";
import { ApiError } from "@/lib/api-client";

import { useCreateGamePlan, useUpdateGamePlan } from "./use-game-plan-mutations";

type OpponentKind = "hero" | "archetype";

/**
 * Create/edit form for a matchup game-plan, surfaced from the deck detail page. On
 * create it names the opponent (a hero from the game's reference data, or a free-text
 * archetype label), the body, and the key cards. On edit the matchup key is immutable
 * (server-enforced), so only the body and key cards change. Key cards use the shared
 * `CardPicker` autocomplete; the chosen set is shown as a removable strip.
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
  const [opponentKind, setOpponentKind] = useState<OpponentKind>("hero");
  const [heroId, setHeroId] = useState("");
  const [archetypeLabel, setArchetypeLabel] = useState("");
  const [body, setBody] = useState(existing?.body ?? "");
  const [keyCards, setKeyCards] = useState<CardSummary[]>(existing?.keyCards ?? []);
  const [validationError, setValidationError] = useState<string | null>(null);

  const create = useCreateGamePlan(teamId);
  const update = useUpdateGamePlan(teamId, existing?.id ?? "");
  const pending = create.isPending || update.isPending;

  function addKeyCard(card: CardSummary) {
    setKeyCards((current) =>
      current.some((entry) => entry.id === card.id) ? current : [...current, card],
    );
  }
  function removeKeyCard(cardId: string) {
    setKeyCards((current) => current.filter((entry) => entry.id !== cardId));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setValidationError(null);
    if (body.trim().length === 0) {
      setValidationError("A game-plan needs a body.");
      return;
    }
    const keyCardIds = keyCards.map((card) => card.id);

    if (isEdit) {
      update.mutate({ body, keyCardIds }, { onSuccess: onDone });
      return;
    }

    if (opponentKind === "hero" && heroId === "") {
      setValidationError("Choose an opponent hero, or switch to an archetype label.");
      return;
    }
    if (opponentKind === "archetype" && archetypeLabel.trim().length === 0) {
      setValidationError("Enter an archetype label, or switch to a hero.");
      return;
    }

    create.mutate(
      {
        ourDeckId: deckId,
        formatId,
        body,
        keyCardIds,
        ...(opponentKind === "hero"
          ? { opponentHeroId: heroId }
          : { opponentArchetypeLabel: archetypeLabel.trim() }),
      },
      { onSuccess: onDone },
    );
  }

  const mutationError = create.error ?? update.error;

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      onSubmit={handleSubmit}
      aria-label={isEdit ? "Edit game-plan" : "New game-plan"}
    >
      {!isEdit ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Opponent</span>
          <div className="flex items-center gap-1">
            {(["hero", "archetype"] as OpponentKind[]).map((kind) => (
              <Button
                key={kind}
                type="button"
                size="sm"
                variant={opponentKind === kind ? "default" : "outline"}
                aria-pressed={opponentKind === kind}
                onClick={() => setOpponentKind(kind)}
              >
                {kind === "hero" ? identityLabel : "Archetype label"}
              </Button>
            ))}
          </div>
          {opponentKind === "hero" ? (
            <HeroPicker teamId={teamId} value={heroId} onChange={setHeroId} id="game-plan-hero" />
          ) : (
            <input
              type="text"
              aria-label="Archetype label"
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
              value={archetypeLabel}
              onChange={(event) => setArchetypeLabel(event.target.value)}
              placeholder="e.g. Aggro Fai"
            />
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <Label htmlFor="game-plan-body">Plan</Label>
        <textarea
          id="game-plan-body"
          className="min-h-32 w-full rounded-md border border-input bg-background p-2 text-sm"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Mulligan priorities, key sequencing, lines…"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Key cards</legend>
        <CardPicker teamId={teamId} onSelect={addKeyCard} placeholder="Search a card…" />
        {keyCards.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {keyCards.map((card) => (
              <li key={card.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{card.name}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeKeyCard(card.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </fieldset>

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

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {isEdit ? "Save" : "Create game-plan"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
