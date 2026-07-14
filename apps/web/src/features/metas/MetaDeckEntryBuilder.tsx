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
import { Section } from "@/components/ui/section";
import { useHeroes } from "@/features/cards/use-heroes";
import { useIdentityLabel } from "@/features/game-logging/use-game-config";
import { HeroPicker } from "@/features/decks/HeroPicker";
import { ApiError } from "@/lib/api-client";

import { SELECT_CLASS } from "./meta-display";
import {
  useAddMetaDeckEntry,
  useRemoveMetaDeckEntry,
  useUpdateMetaDeckEntry,
} from "./use-meta-mutations";

/**
 * A meta's tiered opponent-deck list — the reshaped gauntlet. Each entry is a matchup
 * subject: a required free-text archetype label with an optional hero qualifier, so
 * the same hero can appear more than once under different labels. Entries are grouped
 * by tier (most-central first) and show their label + notes. Any team member may edit
 * the board (a shared team board); the whole subject (label, hero, tier, notes) is
 * editable in place.
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
  const [heroId, setHeroId] = useState("");
  const [label, setLabel] = useState("");
  const [tier, setTier] = useState<MetaTier>("contender");
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editTier, setEditTier] = useState<MetaTier>("contender");
  const [editLabel, setEditLabel] = useState("");
  const [editHeroId, setEditHeroId] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const addEntry = useAddMetaDeckEntry(teamId, metaId);
  const removeEntry = useRemoveMetaDeckEntry(teamId, metaId);
  const updateEntry = useUpdateMetaDeckEntry(teamId, metaId);

  const identityLabel = useIdentityLabel(teamId);
  const { data: heroData } = useHeroes(teamId);
  const heroNamesById = new Map((heroData?.data ?? []).map((hero) => [hero.id, hero.name]));

  /** The hero's display name for an entry, when it carries a hero qualifier. */
  function heroNameFor(entry: MetaDeckEntry): string | null {
    if (!entry.heroId) {
      return null;
    }
    return heroNamesById.get(entry.heroId) ?? null;
  }

  /** The entry's primary display name: its label when set, else the derived snapshot (the hero). */
  function displayLabelFor(entry: MetaDeckEntry): string {
    return entry.label || entry.opponentSnapshotLabel;
  }

  function startEditing(entry: MetaDeckEntry) {
    setEditingEntryId(entry.id);
    setEditTier(entry.tier);
    setEditLabel(entry.label);
    setEditHeroId(entry.heroId ?? "");
    setEditNotes(entry.notes);
  }

  function saveEdit(entry: MetaDeckEntry) {
    // At least one of a hero or a label is required (label "" clears it).
    if (!editHeroId && !editLabel.trim()) {
      return;
    }
    updateEntry.mutate(
      {
        entryId: entry.id,
        body: {
          tier: editTier,
          label: editLabel.trim(),
          heroId: editHeroId ? editHeroId : null,
          notes: editNotes,
        },
      },
      { onSuccess: () => setEditingEntryId(null) },
    );
  }

  function submit() {
    setValidationError(null);
    if (!heroId && !label.trim()) {
      setValidationError("Enter a hero or an archetype label.");
      return;
    }

    const input: CreateMetaDeckEntryInput = {
      tier,
      notes,
      ...(heroId ? { heroId } : {}),
      ...(label.trim() ? { label: label.trim() } : {}),
    };

    addEntry.mutate(input, {
      onSuccess: () => {
        setHeroId("");
        setLabel("");
        setNotes("");
      },
    });
  }

  return (
    <Section title="The field — decks to beat" aria-label="Decks to beat">
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
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`edit-hero-${entry.id}`}>{identityLabel}</Label>
                            <HeroPicker
                              id={`edit-hero-${entry.id}`}
                              teamId={teamId}
                              value={editHeroId}
                              onChange={setEditHeroId}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`edit-label-${entry.id}`}>Archetype (optional)</Label>
                            <Input
                              id={`edit-label-${entry.id}`}
                              value={editLabel}
                              onChange={(event) => setEditLabel(event.target.value)}
                              placeholder="e.g. Aggro Red"
                            />
                          </div>
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
                            aria-label={`Notes for ${displayLabelFor(entry)}`}
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
                            <p className="truncate text-sm font-medium">{displayLabelFor(entry)}</p>
                            {entry.label && heroNameFor(entry) ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {heroNameFor(entry)}
                              </p>
                            ) : null}
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
                                aria-label={`Edit ${displayLabelFor(entry)}`}
                                onClick={() => startEditing(entry)}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label={`Remove ${displayLabelFor(entry)}`}
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
              <Label htmlFor="meta-entry-hero">{identityLabel}</Label>
              <HeroPicker
                id="meta-entry-hero"
                teamId={teamId}
                value={heroId}
                onChange={setHeroId}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="meta-entry-archetype">Archetype (optional)</Label>
              <Input
                id="meta-entry-archetype"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. Aggro Red"
              />
            </div>

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
    </Section>
  );
}
