import {
  type CreateMetaDeckEntryInput,
  META_TIER_LABELS,
  META_TIERS,
  type MetaDeckEntry,
  type MetaTier,
} from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIdentityLabel } from "@/features/game-logging/use-game-config";
import { HeroPicker } from "@/features/decks/HeroPicker";
import { useDecks } from "@/features/decks/use-decks";
import { ApiError } from "@/lib/api-client";

import { SELECT_CLASS } from "./meta-display";
import {
  useAddMetaDeckEntry,
  useRemoveMetaDeckEntry,
  useUpdateMetaDeckEntry,
} from "./use-meta-mutations";

/** The kind of target being added: a reference deck, a bare hero, or a free-text label. */
type TargetKind = "hero" | "deck" | "archetype";

/**
 * A meta's tiered opponent-deck list — the reshaped gauntlet. Entries are grouped by
 * tier (most-central first); each shows its server-derived opponent label and notes.
 * The builder adds an entry by picking a reference deck, a hero, or an archetype
 * label, plus a tier. Any team member may edit the board (a shared team board).
 */
export function MetaDeckEntryBuilder({
  teamId,
  metaId,
  entries,
  canEdit,
}: {
  teamId: string | undefined;
  metaId: string;
  entries: MetaDeckEntry[];
  canEdit: boolean;
}) {
  const [targetKind, setTargetKind] = useState<TargetKind>("hero");
  const [heroId, setHeroId] = useState("");
  const [referenceDeckId, setReferenceDeckId] = useState("");
  const [archetypeLabel, setArchetypeLabel] = useState("");
  const [tier, setTier] = useState<MetaTier>("contender");
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editTier, setEditTier] = useState<MetaTier>("contender");
  const [editNotes, setEditNotes] = useState("");

  const addEntry = useAddMetaDeckEntry(teamId, metaId);
  const removeEntry = useRemoveMetaDeckEntry(teamId, metaId);
  const updateEntry = useUpdateMetaDeckEntry(teamId, metaId);

  const identityLabel = useIdentityLabel(teamId);
  const { data: referenceDeckData } = useDecks(teamId, { isReference: true });
  const referenceDecks = referenceDeckData?.data ?? [];

  function startEditing(entry: MetaDeckEntry) {
    setEditingEntryId(entry.id);
    setEditTier(entry.tier);
    setEditNotes(entry.notes);
  }

  function saveEdit(entry: MetaDeckEntry) {
    updateEntry.mutate(
      { entryId: entry.id, body: { tier: editTier, notes: editNotes } },
      { onSuccess: () => setEditingEntryId(null) },
    );
  }

  function submit() {
    setValidationError(null);

    let input: CreateMetaDeckEntryInput;
    if (targetKind === "hero") {
      if (!heroId) {
        setValidationError(`Pick a ${identityLabel.toLowerCase()} for this target.`);
        return;
      }
      input = { tier, heroId, notes };
    } else if (targetKind === "deck") {
      if (!referenceDeckId) {
        setValidationError("Pick a reference deck for this target.");
        return;
      }
      input = { tier, referenceDeckId, notes };
    } else {
      if (!archetypeLabel.trim()) {
        setValidationError("Enter an archetype label for this target.");
        return;
      }
      input = { tier, archetypeLabel: archetypeLabel.trim(), notes };
    }

    addEntry.mutate(input, {
      onSuccess: () => {
        setHeroId("");
        setReferenceDeckId("");
        setArchetypeLabel("");
        setNotes("");
      },
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold">The field — decks to beat</h3>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No decks in this meta yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {META_TIERS.map((tierValue) => {
            const tierEntries = entries.filter((entry) => entry.tier === tierValue);
            if (tierEntries.length === 0) {
              return null;
            }
            return (
              <div key={tierValue} className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {META_TIER_LABELS[tierValue]}
                </h4>
                <ul className="flex flex-col gap-2">
                  {tierEntries.map((entry) => (
                    <li key={entry.id} className="rounded-md border border-border p-3">
                      {editingEntryId === entry.id ? (
                        <div className="flex flex-col gap-2">
                          <span className="text-sm font-medium">{entry.opponentSnapshotLabel}</span>
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`edit-tier-${entry.id}`}>Tier</Label>
                            <select
                              id={`edit-tier-${entry.id}`}
                              className={SELECT_CLASS}
                              value={editTier}
                              onChange={(event) => setEditTier(event.target.value as MetaTier)}
                            >
                              {META_TIERS.map((option) => (
                                <option key={option} value={option}>
                                  {META_TIER_LABELS[option]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <textarea
                            className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-sm"
                            value={editNotes}
                            onChange={(event) => setEditNotes(event.target.value)}
                            aria-label={`Notes for ${entry.opponentSnapshotLabel}`}
                          />
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              disabled={updateEntry.isPending}
                              onClick={() => saveEdit(entry)}
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
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {entry.opponentSnapshotLabel}
                            </p>
                            {entry.notes ? (
                              <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                                {entry.notes}
                              </p>
                            ) : null}
                          </div>
                          {canEdit ? (
                            <div className="flex shrink-0 gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label={`Edit ${entry.opponentSnapshotLabel}`}
                                onClick={() => startEditing(entry)}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label={`Remove ${entry.opponentSnapshotLabel}`}
                                disabled={removeEntry.isPending}
                                onClick={() => removeEntry.mutate(entry.id)}
                              >
                                Remove
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {canEdit ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="meta-entry-kind">Target</Label>
              <select
                id="meta-entry-kind"
                className={SELECT_CLASS}
                value={targetKind}
                onChange={(event) => setTargetKind(event.target.value as TargetKind)}
                aria-label="Target kind"
              >
                <option value="hero">{identityLabel}</option>
                <option value="deck">Reference deck</option>
                <option value="archetype">Archetype label</option>
              </select>
            </div>

            {targetKind === "hero" ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor="meta-entry-hero">{identityLabel}</Label>
                <HeroPicker
                  id="meta-entry-hero"
                  teamId={teamId}
                  value={heroId}
                  onChange={setHeroId}
                />
              </div>
            ) : targetKind === "deck" ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor="meta-entry-deck">Reference deck</Label>
                <select
                  id="meta-entry-deck"
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
                <Label htmlFor="meta-entry-archetype">Archetype</Label>
                <Input
                  id="meta-entry-archetype"
                  value={archetypeLabel}
                  onChange={(event) => setArchetypeLabel(event.target.value)}
                  placeholder="e.g. Aggro Red"
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <Label htmlFor="meta-entry-tier">Tier</Label>
              <select
                id="meta-entry-tier"
                className={SELECT_CLASS}
                value={tier}
                onChange={(event) => setTier(event.target.value as MetaTier)}
                aria-label="Tier"
              >
                {META_TIERS.map((option) => (
                  <option key={option} value={option}>
                    {META_TIER_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>

            <Button type="button" size="sm" onClick={submit} disabled={addEntry.isPending}>
              Add deck
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
                : "Could not add the deck entry."}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
