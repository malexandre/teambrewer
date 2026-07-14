import {
  type CreateDeckInput,
  type DeckDetail,
  type DeckMetaEntryLink,
  type DeckVisibility,
  type UpdateDeckInput,
} from "@teambrewer/shared";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { matchupSubjectDisplayName } from "@teambrewer/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHeroes } from "@/features/cards/use-heroes";
import { useIdentityLabel } from "@/features/game-logging/use-game-config";
import { formatMetaDate, SELECT_CLASS } from "@/features/metas/meta-display";
import {
  mostRecentMetaForFormat,
  useMetaDeckEntriesByMeta,
  useMetas,
} from "@/features/metas/use-metas";
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

  // Meta linking: on edit, seed the deck's current links; on create, default-select the
  // most recent meta of the currently-selected format (mirroring the server's per-format
  // default), re-applied until the member customizes the selection. Submitting before a
  // format is chosen leaves nothing linked (the server links nothing for a format with
  // no meta).
  const { data: metaListData } = useMetas(teamId);
  const metas = metaListData?.data ?? [];
  const [metaIds, setMetaIds] = useState<string[] | undefined>(
    deck ? deck.linkedMetas.map((meta) => meta.id) : undefined,
  );
  const metaSelectionCustomizedRef = useRef(false);
  useEffect(() => {
    if (deck || metaSelectionCustomizedRef.current) return;
    const recent = mostRecentMetaForFormat(metaListData?.data ?? [], formatId);
    setMetaIds(recent ? [recent.id] : []);
  }, [deck, metaListData, formatId]);
  const selectedMetaIds = metaIds ?? [];

  // Per-meta entry link: within a linked meta, which of its deck entries this deck is
  // the team's build of. Seeded from the deck's stored links on edit.
  const [entryByMeta, setEntryByMeta] = useState<Record<string, string>>(() =>
    deck
      ? Object.fromEntries(
          deck.linkedMetas
            .filter((meta) => meta.metaDeckEntryId)
            .map((meta) => [meta.id, meta.metaDeckEntryId as string]),
        )
      : {},
  );
  const entriesById = useMetaDeckEntriesByMeta(teamId, selectedMetaIds);
  const { data: heroData } = useHeroes(teamId);
  const heroNameById = new Map((heroData?.data ?? []).map((hero) => [hero.id, hero.name]));
  function entriesForMeta(metaId: string) {
    return [...entriesById.values()].filter((entry) => entry.metaId === metaId);
  }
  /** An entry's option label, leading with its hero, then its archetype label. */
  function entryOptionLabel(entry: {
    heroId: string | null;
    label: string;
    opponentSnapshotLabel: string;
  }) {
    const heroName = entry.heroId ? heroNameById.get(entry.heroId) : undefined;
    return matchupSubjectDisplayName(heroName, entry.label) || entry.opponentSnapshotLabel;
  }

  function toggleMeta(metaId: string) {
    metaSelectionCustomizedRef.current = true;
    setMetaIds((current) => {
      const selected = current ?? [];
      return selected.includes(metaId)
        ? selected.filter((id) => id !== metaId)
        : [...selected, metaId];
    });
  }

  function chooseEntry(metaId: string, entryId: string): void {
    setEntryByMeta((current) => {
      const next = { ...current };
      if (entryId) {
        next[metaId] = entryId;
      } else {
        delete next[metaId];
      }
      return next;
    });
  }

  /** The entry links for the metas still selected (dropped entries for unselected metas). */
  function buildMetaEntryLinks(): DeckMetaEntryLink[] {
    return selectedMetaIds.flatMap((metaId) =>
      entryByMeta[metaId] ? [{ metaId, metaDeckEntryId: entryByMeta[metaId] }] : [],
    );
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
        metaEntryLinks: buildMetaEntryLinks(),
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
      // Only send an explicit set once initialized; otherwise the server links the most
      // recent meta of the deck's format by default.
      ...(metaIds !== undefined ? { metaIds } : {}),
      ...(buildMetaEntryLinks().length > 0 ? { metaEntryLinks: buildMetaEntryLinks() } : {}),
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
          <HeroPicker
            id="deck-hero"
            teamId={teamId}
            formatId={formatId || undefined}
            value={heroId}
            onChange={setHeroId}
          />
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
            {metas.map((meta) => {
              const isSelected = selectedMetaIds.includes(meta.id);
              const metaEntries = entriesForMeta(meta.id);
              return (
                <li key={meta.id} className="flex flex-col gap-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleMeta(meta.id)}
                    />
                    <span>{meta.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatMetaDate(meta.startDate)} – {formatMetaDate(meta.endDate)}
                    </span>
                  </label>
                  {isSelected && metaEntries.length > 0 ? (
                    <label className="ml-6 flex items-center gap-2 text-xs text-muted-foreground">
                      This deck is
                      <select
                        className={SELECT_CLASS}
                        aria-label={`This deck's meta deck in ${meta.name}`}
                        value={entryByMeta[meta.id] ?? ""}
                        onChange={(event) => chooseEntry(meta.id, event.target.value)}
                      >
                        <option value="">— not a listed meta deck —</option>
                        {metaEntries.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entryOptionLabel(entry)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </li>
              );
            })}
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
