import { type CreateGauntletEntryInput, type GauntletEntry } from "@teambrewer/shared";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHeroes } from "@/features/cards/use-heroes";
import { HeroPicker } from "@/features/decks/HeroPicker";
import { useDecks } from "@/features/decks/use-decks";
import { ApiError } from "@/lib/api-client";

import { SELECT_CLASS } from "./event-display";
import {
  useAddGauntletEntry,
  useRemoveGauntletEntry,
  useUpdateGauntletEntry,
} from "./use-event-mutations";

/** The kind of target being added: a reference deck, a bare hero, or a free-text label. */
type TargetKind = "hero" | "deck" | "archetype";

/**
 * The gauntlet: the field to beat, weighted by expected metagame share. Entries are
 * shown highest-share first as a simple share bar; the builder adds an entry by
 * picking a reference deck, a hero, or typing an archetype label, with a running
 * total of shares (a subtle warning past 100). Any team member may edit the board.
 */
export function GauntletBuilder({
  teamId,
  eventId,
  entries,
  canEdit,
}: {
  teamId: string | undefined;
  eventId: string;
  entries: GauntletEntry[];
  canEdit: boolean;
}) {
  const [targetKind, setTargetKind] = useState<TargetKind>("hero");
  const [heroId, setHeroId] = useState("");
  const [referenceDeckId, setReferenceDeckId] = useState("");
  const [archetypeLabel, setArchetypeLabel] = useState("");
  const [share, setShare] = useState("10");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editShare, setEditShare] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const addEntry = useAddGauntletEntry(teamId, eventId);
  const removeEntry = useRemoveGauntletEntry(teamId, eventId);
  const updateEntry = useUpdateGauntletEntry(teamId, eventId);

  const { data: heroData } = useHeroes(teamId);
  const { data: referenceDeckData } = useDecks(teamId, { isReference: true });
  const heroNames = useMemo(
    () => new Map((heroData?.data ?? []).map((hero) => [hero.id, hero.name])),
    [heroData],
  );
  const deckNames = useMemo(
    () => new Map((referenceDeckData?.data ?? []).map((deck) => [deck.id, deck.name])),
    [referenceDeckData],
  );

  const runningTotal = entries.reduce((sum, entry) => sum + entry.expectedMetaShare, 0);
  const referenceDecks = referenceDeckData?.data ?? [];

  function targetLabel(entry: GauntletEntry): string {
    if (entry.referenceDeckId) {
      return deckNames.get(entry.referenceDeckId) ?? "Reference deck";
    }
    if (entry.heroId) {
      return heroNames.get(entry.heroId) ?? "Hero";
    }
    return entry.archetypeLabel ?? "Archetype";
  }

  function startEditingShare(entry: GauntletEntry) {
    setEditError(null);
    setEditingEntryId(entry.id);
    setEditShare(String(entry.expectedMetaShare));
  }

  function saveShare(entry: GauntletEntry) {
    setEditError(null);
    const shareValue = Number(editShare);
    if (!Number.isInteger(shareValue) || shareValue < 0 || shareValue > 100) {
      setEditError("Expected share must be a whole number between 0 and 100.");
      return;
    }
    updateEntry.mutate(
      { gauntletEntryId: entry.id, body: { expectedMetaShare: shareValue } },
      { onSuccess: () => setEditingEntryId(null) },
    );
  }

  function submit() {
    setValidationError(null);
    const shareValue = Number(share);
    if (!Number.isInteger(shareValue) || shareValue < 0 || shareValue > 100) {
      setValidationError("Expected share must be a whole number between 0 and 100.");
      return;
    }

    let input: CreateGauntletEntryInput;
    if (targetKind === "hero") {
      if (!heroId) {
        setValidationError("Pick a hero for this target.");
        return;
      }
      input = { heroId, expectedMetaShare: shareValue, notes: "" };
    } else if (targetKind === "deck") {
      if (!referenceDeckId) {
        setValidationError("Pick a reference deck for this target.");
        return;
      }
      input = { referenceDeckId, expectedMetaShare: shareValue, notes: "" };
    } else {
      if (!archetypeLabel.trim()) {
        setValidationError("Enter an archetype label for this target.");
        return;
      }
      input = { archetypeLabel: archetypeLabel.trim(), expectedMetaShare: shareValue, notes: "" };
    }

    addEntry.mutate(input, {
      onSuccess: () => {
        setHeroId("");
        setReferenceDeckId("");
        setArchetypeLabel("");
        setShare("10");
      },
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Gauntlet — the field to beat</h3>
        <span
          className={`text-xs ${runningTotal > 100 ? "text-amber-600" : "text-muted-foreground"}`}
        >
          Total expected share: {runningTotal}%
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No gauntlet entries yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{targetLabel(entry)}</span>
                  {editingEntryId === entry.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={editShare}
                        onChange={(event) => setEditShare(event.target.value)}
                        className="h-7 w-20"
                        aria-label={`Expected share for ${targetLabel(entry)}`}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={updateEntry.isPending}
                        onClick={() => saveShare(entry)}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingEntryId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {entry.expectedMetaShare}%
                    </span>
                  )}
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.min(entry.expectedMetaShare, 100)}%` }}
                    aria-hidden
                  />
                </div>
                {editingEntryId === entry.id && editError ? (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {editError}
                  </p>
                ) : null}
              </div>
              {canEdit && editingEntryId !== entry.id ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Edit share for ${targetLabel(entry)}`}
                    onClick={() => startEditingShare(entry)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${targetLabel(entry)}`}
                    disabled={removeEntry.isPending}
                    onClick={() => removeEntry.mutate(entry.id)}
                  >
                    Remove
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="gauntlet-kind">Target</Label>
              <select
                id="gauntlet-kind"
                className={SELECT_CLASS}
                value={targetKind}
                onChange={(event) => setTargetKind(event.target.value as TargetKind)}
                aria-label="Target kind"
              >
                <option value="hero">Hero</option>
                <option value="deck">Reference deck</option>
                <option value="archetype">Archetype label</option>
              </select>
            </div>

            {targetKind === "hero" ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor="gauntlet-hero">Hero</Label>
                <HeroPicker
                  id="gauntlet-hero"
                  teamId={teamId}
                  value={heroId}
                  onChange={setHeroId}
                />
              </div>
            ) : targetKind === "deck" ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor="gauntlet-deck">Reference deck</Label>
                <select
                  id="gauntlet-deck"
                  className={SELECT_CLASS}
                  value={referenceDeckId}
                  onChange={(event) => setReferenceDeckId(event.target.value)}
                  aria-label="Reference deck"
                >
                  <option value="">Select a reference deck…</option>
                  {referenceDecks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <Label htmlFor="gauntlet-archetype">Archetype</Label>
                <Input
                  id="gauntlet-archetype"
                  value={archetypeLabel}
                  onChange={(event) => setArchetypeLabel(event.target.value)}
                  placeholder="e.g. Aggro Red"
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <Label htmlFor="gauntlet-share">Expected share (%)</Label>
              <Input
                id="gauntlet-share"
                type="number"
                min={0}
                max={100}
                value={share}
                onChange={(event) => setShare(event.target.value)}
                className="w-24"
              />
            </div>

            <Button type="button" size="sm" onClick={submit} disabled={addEntry.isPending}>
              Add to gauntlet
            </Button>
          </div>

          {validationError ? (
            <p role="alert" className="text-sm text-destructive">
              {validationError}
            </p>
          ) : null}
          {addEntry.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {addEntry.error instanceof ApiError
                ? addEntry.error.message
                : "Could not add the gauntlet entry."}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
