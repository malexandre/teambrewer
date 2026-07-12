import type { PrimerDetail, PrimerKind, PrimerVisibility } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDecks } from "@/features/decks/use-decks";
import { ApiError } from "@/lib/api-client";

import { useCreatePrimer, useUpdatePrimer } from "./use-primer-mutations";

const KIND_OPTIONS: { value: PrimerKind; label: string }[] = [
  { value: "deck_primer", label: "Deck primer" },
  { value: "matchup", label: "Matchup" },
  { value: "format_notes", label: "Format notes" },
  { value: "other", label: "Other" },
];

/**
 * Create/edit form for a primer. `title` and `kind` are required; `relatedDeckId` links
 * an optional team deck; `visibility` toggles team/private; the body is authored as
 * plain markdown-source text (rendered pre-wrapped on read). On edit the same fields are
 * pre-filled and PATCHed.
 */
export function PrimerEditor({
  teamId,
  existing,
  onDone,
}: {
  teamId: string | undefined;
  existing?: PrimerDetail;
  onDone: () => void;
}) {
  const isEdit = existing !== undefined;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [kind, setKind] = useState<PrimerKind>(existing?.kind ?? "matchup");
  const [relatedDeckId, setRelatedDeckId] = useState(existing?.relatedDeckId ?? "");
  const [visibility, setVisibility] = useState<PrimerVisibility>(existing?.visibility ?? "team");
  const [body, setBody] = useState(existing?.body ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: decksData } = useDecks(teamId);
  const decks = decksData?.data ?? [];

  const create = useCreatePrimer(teamId);
  const update = useUpdatePrimer(teamId, existing?.id ?? "");
  const pending = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setValidationError(null);
    if (title.trim().length === 0) {
      setValidationError("A primer needs a title.");
      return;
    }
    if (body.trim().length === 0) {
      setValidationError("A primer needs a body.");
      return;
    }
    const relatedDeck = relatedDeckId === "" ? undefined : relatedDeckId;

    if (isEdit) {
      update.mutate(
        { title, kind, body, visibility, relatedDeckId: relatedDeck ?? null },
        { onSuccess: onDone },
      );
      return;
    }
    create.mutate(
      { title, kind, body, visibility, ...(relatedDeck ? { relatedDeckId: relatedDeck } : {}) },
      { onSuccess: onDone },
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      onSubmit={handleSubmit}
      aria-label={isEdit ? "Edit primer" : "New primer"}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="primer-title">Title</Label>
        <Input
          id="primer-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Beating Aggro Fai"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="primer-kind">Kind</Label>
          <select
            id="primer-kind"
            className="rounded-md border border-input bg-background p-2 text-sm"
            value={kind}
            onChange={(event) => setKind(event.target.value as PrimerKind)}
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="primer-deck">Related deck (optional)</Label>
          <select
            id="primer-deck"
            className="rounded-md border border-input bg-background p-2 text-sm"
            value={relatedDeckId}
            onChange={(event) => setRelatedDeckId(event.target.value)}
          >
            <option value="">None</option>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="primer-visibility">Visibility</Label>
          <select
            id="primer-visibility"
            className="rounded-md border border-input bg-background p-2 text-sm"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as PrimerVisibility)}
          >
            <option value="team">Team</option>
            <option value="private">Private (only you)</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="primer-body">Body</Label>
        <textarea
          id="primer-body"
          className="min-h-48 w-full rounded-md border border-input bg-background p-2 text-sm"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write the primer… (plain text; line breaks are preserved)"
        />
      </div>

      {validationError ? (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      ) : null}
      {mutationError ? (
        <p role="alert" className="text-sm text-destructive">
          {mutationError instanceof ApiError ? mutationError.message : "Could not save the primer."}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {isEdit ? "Save" : "Create primer"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
