import {
  type CreateDeckInput,
  type DeckDetail,
  type DeckVisibility,
  type UpdateDeckInput,
} from "@teambrewer/shared";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIdentityLabel } from "@/features/game-logging/use-game-config";
import { formatMetaDate } from "@/features/metas/meta-display";
import { useCurrentMeta, useMetas } from "@/features/metas/use-metas";
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
 * best-effort provider hint), visibility, and tags. There is no card-list editor.
 * Notes are edited separately on the deck page (with inline `+card` mentions), and
 * status moves through the dedicated status control there.
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
  const identityLabel = useIdentityLabel(teamId);
  const [name, setName] = useState(deck?.name ?? "");
  const [formatId, setFormatId] = useState(deck?.formatId ?? "");
  const [heroId, setHeroId] = useState(deck?.heroId ?? "");
  const [externalUrl, setExternalUrl] = useState(deck?.externalUrl ?? "");
  const [visibility, setVisibility] = useState<DeckVisibility>(deck?.visibility ?? "team");
  const [tags, setTags] = useState((deck?.tags ?? []).join(", "));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [recognizedLabel, setRecognizedLabel] = useState<string | null>(null);

  const createDeck = useCreateDeck(teamId);
  const updateDeck = useUpdateDeck(teamId, deck?.id ?? "");
  const recognize = useRecognizeDeckUrl(teamId);

  // Meta linking: on edit, seed the deck's current links; on create, default-select
  // the current meta once it resolves (undefined = not yet initialized, so submitting
  // before metas load omits `metaIds` and lets the server apply the current-meta default).
  const { data: metaListData } = useMetas(teamId);
  const { data: currentMeta, isPending: currentMetaPending } = useCurrentMeta(teamId);
  const [metaIds, setMetaIds] = useState<string[] | undefined>(
    deck ? deck.linkedMetas.map((meta) => meta.id) : undefined,
  );
  useEffect(() => {
    if (deck || metaIds !== undefined) return;
    if (currentMeta) {
      setMetaIds([currentMeta.id]);
    } else if (!currentMetaPending) {
      setMetaIds([]);
    }
  }, [deck, metaIds, currentMeta, currentMetaPending]);
  const selectedMetaIds = metaIds ?? [];
  const metas = metaListData?.data ?? [];

  function toggleMeta(metaId: string) {
    setMetaIds((current) => {
      const selected = current ?? [];
      return selected.includes(metaId)
        ? selected.filter((id) => id !== metaId)
        : [...selected, metaId];
    });
  }

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
        tags: parseTags(tags),
        metaIds: selectedMetaIds,
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
      tags: parseTags(tags),
      // Notes start empty and are written later via the deck page's +card editor.
      notes: "",
      // Only send an explicit set once initialized; otherwise the server links the
      // current meta by default.
      ...(metaIds !== undefined ? { metaIds } : {}),
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
          <Label htmlFor="deck-hero">{identityLabel}</Label>
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

      <div className="flex flex-col gap-1">
        <Label htmlFor="deck-visibility">Visibility</Label>
        <DeckVisibilityControl id="deck-visibility" value={visibility} onChange={setVisibility} />
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

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Metas</legend>
        {metas.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No metas yet. Create a meta to track this deck against the field.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {metas.map((meta) => (
              <li key={meta.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedMetaIds.includes(meta.id)}
                    onChange={() => toggleMeta(meta.id)}
                  />
                  <span>{meta.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatMetaDate(meta.startDate)} – {formatMetaDate(meta.endDate)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <p className="text-xs text-muted-foreground">
        Notes are edited on the deck page, where you can link cards inline with <code>+</code>.
      </p>

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
