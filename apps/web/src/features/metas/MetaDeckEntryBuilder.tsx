import {
  type CreateMetaDeckEntryInput,
  META_TIER_LABELS,
  META_TIERS,
  type MetaDeckEntry,
  type MetaTier,
} from "@teambrewer/shared";
import { Pencil, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
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
 * A meta's tiered opponent-deck list — the reshaped gauntlet — rendered as a tier-list:
 * per tier, a grid of hero "squares". Each square shows the hero's image (from the card
 * database) with the archetype label overlaid bottom-left, and — for editors — a pencil
 * (edit) and a cross (remove) top-right. Clicking a square opens its details (notes).
 * Each entry is a matchup subject: an optional hero qualifier + an optional free-text
 * archetype label, so the same hero can appear more than once under different labels.
 * Any team member may edit the board (a shared team board); the whole subject is editable.
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

  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);

  const addEntry = useAddMetaDeckEntry(teamId, metaId);
  const removeEntry = useRemoveMetaDeckEntry(teamId, metaId);
  const updateEntry = useUpdateMetaDeckEntry(teamId, metaId);

  const identityLabel = useIdentityLabel(teamId);
  const { data: heroData } = useHeroes(teamId);
  const heroesById = new Map((heroData?.data ?? []).map((hero) => [hero.id, hero]));

  /** The hero (name + image) for an entry, when it carries a hero qualifier. */
  function heroFor(entry: MetaDeckEntry) {
    return entry.heroId ? (heroesById.get(entry.heroId) ?? null) : null;
  }

  /** The entry's primary display name: the hero when it has one, else the label. */
  function displayLabelFor(entry: MetaDeckEntry): string {
    return heroFor(entry)?.name ?? (entry.label || entry.opponentSnapshotLabel);
  }

  function startEditing(entry: MetaDeckEntry) {
    setDetailEntryId(null);
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

  const editingEntry = entries.find((entry) => entry.id === editingEntryId) ?? null;
  const detailEntry = entries.find((entry) => entry.id === detailEntryId) ?? null;

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
                <ul className="flex flex-wrap gap-2">
                  {tierEntries.map((entry) => {
                    const hero = heroFor(entry);
                    const displayLabel = displayLabelFor(entry);
                    return (
                      <li key={entry.id} className="relative">
                        <button
                          type="button"
                          onClick={() => setDetailEntryId(entry.id)}
                          aria-label={`Details for ${displayLabel}`}
                          className="relative flex h-36 w-36 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-center transition hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {hero?.imageUrl ? (
                            <img
                              src={hero.imageUrl}
                              alt={hero.name}
                              className="h-full w-full object-cover object-top"
                            />
                          ) : (
                            <span className="line-clamp-3 px-1 text-xs font-medium">
                              {hero?.name ?? displayLabel}
                            </span>
                          )}
                          {entry.heroId && entry.label ? (
                            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1 pb-0.5 pt-3 text-left text-[10px] font-medium text-white">
                              {entry.label}
                            </span>
                          ) : null}
                        </button>
                        {canEdit ? (
                          <div className="absolute right-1 top-1 flex gap-1">
                            <button
                              type="button"
                              aria-label={`Edit ${displayLabel}`}
                              onClick={() => startEditing(entry)}
                              className="rounded bg-black/22 p-1 text-white shadow-sm transition hover:bg-black/50"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove ${displayLabel}`}
                              disabled={removeEntry.isPending}
                              onClick={() => removeEntry.mutate(entry.id)}
                              className="rounded bg-black/22 p-1 text-white shadow-sm transition hover:bg-destructive"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
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

      {/* Detail dialog — the notes/details behind a square. */}
      <Dialog
        open={Boolean(detailEntry)}
        onClose={() => setDetailEntryId(null)}
        title={detailEntry ? displayLabelFor(detailEntry) : ""}
      >
        {detailEntry ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              {heroFor(detailEntry)?.imageUrl ? (
                <img
                  src={heroFor(detailEntry)?.imageUrl ?? undefined}
                  alt={heroFor(detailEntry)?.name ?? ""}
                  className="h-24 w-24 shrink-0 rounded-md border border-border object-cover object-top"
                />
              ) : null}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {heroFor(detailEntry) ? (
                  <>
                    <dt className="text-muted-foreground">{identityLabel}</dt>
                    <dd>{heroFor(detailEntry)?.name}</dd>
                  </>
                ) : null}
                {detailEntry.label ? (
                  <>
                    <dt className="text-muted-foreground">Archetype</dt>
                    <dd>{detailEntry.label}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Tier</dt>
                <dd>{META_TIER_LABELS[detailEntry.tier]}</dd>
              </dl>
            </div>
            {detailEntry.notes ? (
              <p className="whitespace-pre-wrap text-sm">{detailEntry.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No details yet.</p>
            )}
            {canEdit ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => startEditing(detailEntry)}
                >
                  Edit
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      {/* Edit dialog — the whole matchup subject (hero, archetype, tier, notes). */}
      <Dialog
        open={Boolean(editingEntry)}
        onClose={() => setEditingEntryId(null)}
        title="Edit entry"
      >
        {editingEntry ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit-hero">{identityLabel}</Label>
              <HeroPicker
                id="edit-hero"
                teamId={teamId}
                value={editHeroId}
                onChange={setEditHeroId}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit-label">Archetype (optional)</Label>
              <Input
                id="edit-label"
                value={editLabel}
                onChange={(event) => setEditLabel(event.target.value)}
                placeholder="e.g. Aggro Red"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit-tier">Tier</Label>
              <select
                id="edit-tier"
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
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit-notes">Details</Label>
              <textarea
                id="edit-notes"
                className="min-h-24 w-full rounded-md border border-input bg-background p-2 text-sm"
                value={editNotes}
                onChange={(event) => setEditNotes(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditingEntryId(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={updateEntry.isPending}
                onClick={() => saveEdit(editingEntry)}
              >
                Save
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </Section>
  );
}
