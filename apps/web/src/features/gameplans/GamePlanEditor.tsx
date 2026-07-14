import type { MatchupGamePlan, MetaDeckEntry } from "@teambrewer/shared";
import { META_TIER_LABELS } from "@teambrewer/shared";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { useHeroes } from "@/features/cards/use-heroes";
import { MentionComposer } from "@/features/collaboration/MentionComposer";
import { HeroPicker } from "@/features/decks/HeroPicker";
import { useIdentityLabel } from "@/features/game-logging/use-game-config";
import { META_TIER_TONE } from "@/features/metas/meta-display";
import { ApiError } from "@/lib/api-client";

import { metaEntryDisplayName } from "./gameplan-display";
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
  metaName,
  metaDeckEntries,
  onDone,
}: {
  teamId: string | undefined;
  deckId: string;
  formatId: string;
  existing?: MatchupGamePlan;
  /** The current meta's name (for the assignment label), or null when none is current. */
  metaName: string | null;
  /** The current meta's tiered deck entries, offered as assignment targets. */
  metaDeckEntries: MetaDeckEntry[];
  onDone: () => void;
}) {
  const isEdit = existing !== undefined;
  const identityLabel = useIdentityLabel(teamId);
  const [heroId, setHeroId] = useState("");
  const [archetypeLabel, setArchetypeLabel] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  // The set of meta deck entries this plan covers (edited via the multi-select). Seeded
  // from the existing assignment on edit; the whole set is sent on save (replace semantics).
  const [coveredEntryIds, setCoveredEntryIds] = useState<string[]>(
    existing?.metaDeckEntryIds ?? [],
  );
  // The body lives in the composer (uncontrolled); mirror the last submitted value so a
  // validation/API failure can re-seed a remounted composer instead of dropping the text.
  const [draftBody, setDraftBody] = useState(existing?.body ?? "");
  const [composerKey, setComposerKey] = useState(0);

  const { data: heroData } = useHeroes(teamId);
  const heroNamesById = useMemo(
    () => new Map((heroData?.data ?? []).map((hero) => [hero.id, hero.name])),
    [heroData],
  );
  const coverageOptions: MultiSelectOption[] = useMemo(
    () =>
      metaDeckEntries.map((entry) => {
        const name = metaEntryDisplayName(entry, heroNamesById);
        return {
          value: entry.id,
          label: name,
          node: (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{name}</span>
              <Badge tone={META_TIER_TONE[entry.tier]} size="sm">
                {META_TIER_LABELS[entry.tier]}
              </Badge>
            </span>
          ),
        };
      }),
    [metaDeckEntries, heroNamesById],
  );

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
      update.mutate(
        { body, metaDeckEntryIds: coveredEntryIds },
        { onSuccess: onDone, onError: () => restoreComposer(body) },
      );
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
        ...(coveredEntryIds.length > 0 ? { metaDeckEntryIds: coveredEntryIds } : {}),
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
          <HeroPicker
            teamId={teamId}
            formatId={formatId}
            value={heroId}
            onChange={setHeroId}
            id="game-plan-hero"
          />
        </div>
      ) : null}

      {coverageOptions.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="game-plan-coverage">
            Covers matchups{metaName ? ` · ${metaName}` : ""}
          </Label>
          <MultiSelect
            id="game-plan-coverage"
            ariaLabel="Covers matchups"
            placeholder="Which of this meta's decks does this beat?"
            options={coverageOptions}
            value={coveredEntryIds}
            onChange={setCoveredEntryIds}
          />
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
