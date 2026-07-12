import {
  type CreateDeckInput,
  type DeckDetail,
  type DeckVisibility,
  type UpdateDeckInput,
} from "@teambrewer/shared";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";

import { DeckVisibilityControl } from "./DeckVisibilityControl";
import { FormatPicker } from "./FormatPicker";
import { HeroPicker } from "./HeroPicker";
import { useCreateDeck, useRecognizeDeckUrl, useUpdateDeck } from "./use-deck-mutations";

/** Split a comma-separated tag input into trimmed, non-empty tags. */
function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * Create or edit a deck. A deck is a link + metadata (ADR-0002): a name, a format
 * and optional hero from the game's reference data, the external list URL (with a
 * best-effort provider hint), visibility, a reference-deck flag, tags, and notes.
 * There is no card-list editor. Status is not edited here — it moves through the
 * dedicated status control on the deck detail.
 */
export function DeckForm({
  teamId,
  deck,
  onSaved,
  onCancel,
}: {
  teamId: string | undefined;
  deck?: DeckDetail;
  onSaved: (deck: DeckDetail) => void;
  onCancel?: () => void;
}) {
  const isEditing = Boolean(deck);
  const [name, setName] = useState(deck?.name ?? "");
  const [formatId, setFormatId] = useState(deck?.formatId ?? "");
  const [heroId, setHeroId] = useState(deck?.heroId ?? "");
  const [externalUrl, setExternalUrl] = useState(deck?.externalUrl ?? "");
  const [visibility, setVisibility] = useState<DeckVisibility>(deck?.visibility ?? "team");
  const [isReference, setIsReference] = useState(deck?.isReference ?? false);
  const [tags, setTags] = useState((deck?.tags ?? []).join(", "));
  const [notes, setNotes] = useState(deck?.notes ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [recognizedLabel, setRecognizedLabel] = useState<string | null>(null);

  const createDeck = useCreateDeck(teamId);
  const updateDeck = useUpdateDeck(teamId, deck?.id ?? "");
  const recognize = useRecognizeDeckUrl(teamId);

  const mutation = isEditing ? updateDeck : createDeck;

  function recognizeCurrentUrl() {
    const url = externalUrl.trim();
    if (!url) {
      setRecognizedLabel(null);
      return;
    }
    recognize.mutate(url, {
      onSuccess: (result) => {
        setRecognizedLabel(
          result.recognized ? `Recognized: ${result.recognized.provider}` : "Link not recognized",
        );
      },
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setValidationError(null);

    if (!name.trim()) {
      setValidationError("A deck name is required.");
      return;
    }
    if (!formatId) {
      setValidationError("A format is required.");
      return;
    }
    if (!externalUrl.trim()) {
      setValidationError("An external deck link is required.");
      return;
    }

    if (isEditing && deck) {
      const input: UpdateDeckInput = {
        name: name.trim(),
        formatId,
        heroId: heroId ? heroId : null,
        externalUrl: externalUrl.trim(),
        visibility,
        isReference,
        tags: parseTags(tags),
        notes,
      };
      updateDeck.mutate(input, { onSuccess: onSaved });
      return;
    }

    const input: CreateDeckInput = {
      name: name.trim(),
      formatId,
      ...(heroId ? { heroId } : {}),
      externalUrl: externalUrl.trim(),
      visibility,
      isReference,
      tags: parseTags(tags),
      notes,
    };
    createDeck.mutate(input, { onSuccess: onSaved });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="deck-name">Name</Label>
        <Input
          id="deck-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Aggro Dorinthea"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="deck-format">Format</Label>
          <FormatPicker id="deck-format" teamId={teamId} value={formatId} onChange={setFormatId} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="deck-hero">Hero</Label>
          <HeroPicker id="deck-hero" teamId={teamId} value={heroId} onChange={setHeroId} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="deck-url">External deck link</Label>
        <Input
          id="deck-url"
          type="url"
          value={externalUrl}
          onChange={(event) => setExternalUrl(event.target.value)}
          onBlur={recognizeCurrentUrl}
          placeholder="https://fabrary.net/decks/…"
        />
        {recognizedLabel ? (
          <p className="text-xs text-muted-foreground">{recognizedLabel}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="deck-visibility">Visibility</Label>
          <DeckVisibilityControl id="deck-visibility" value={visibility} onChange={setVisibility} />
        </div>
        <label className="flex items-center gap-2 text-sm sm:mt-6">
          <input
            type="checkbox"
            checked={isReference}
            onChange={(event) => setIsReference(event.target.checked)}
          />
          Reference deck (opponent / meta archetype)
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="deck-tags">Tags</Label>
        <Input
          id="deck-tags"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="comma, separated, tags"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="deck-notes">Notes</Label>
        <textarea
          id="deck-notes"
          className="min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      {validationError ? (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      ) : null}
      {mutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error instanceof ApiError ? mutation.error.message : "Could not save the deck."}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {isEditing ? "Save changes" : "Create deck"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
