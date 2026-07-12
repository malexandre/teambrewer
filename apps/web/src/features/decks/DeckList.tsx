import { Link } from "@tanstack/react-router";
import { type DeckStatus, deckStatusSchema } from "@teambrewer/shared";
import { useMemo, useState } from "react";

import { useFormats } from "@/features/cards/use-formats";
import { useHeroes } from "@/features/cards/use-heroes";

import { DECK_STATUS_LABELS, DECK_VISIBILITY_LABELS, SELECT_CLASS } from "./deck-display";
import { FormatPicker } from "./FormatPicker";
import { HeroPicker } from "./HeroPicker";
import { type DeckFilters, useDecks } from "./use-decks";

/** "all" | "true" | "false" for the reference-deck filter select. */
type ReferenceFilter = "all" | "true" | "false";

/**
 * The team's decks with filters (status, format, hero, reference) and a
 * private/team indicator. Mobile-first; each row links to the deck detail. Format
 * and hero ids are resolved to names via the reference-data hooks.
 */
export function DeckList({ teamId }: { teamId: string | undefined }) {
  const [status, setStatus] = useState<DeckStatus | "">("");
  const [formatId, setFormatId] = useState("");
  const [heroId, setHeroId] = useState("");
  const [reference, setReference] = useState<ReferenceFilter>("all");

  const filters: DeckFilters = {
    ...(status ? { status } : {}),
    ...(formatId ? { formatId } : {}),
    ...(heroId ? { heroId } : {}),
    ...(reference !== "all" ? { isReference: reference === "true" } : {}),
  };

  const { data, isPending } = useDecks(teamId, filters);
  const { data: formatData } = useFormats(teamId);
  const { data: heroData } = useHeroes(teamId);

  const formatNames = useMemo(
    () => new Map((formatData?.data ?? []).map((format) => [format.id, format.name])),
    [formatData],
  );
  const heroNames = useMemo(
    () => new Map((heroData?.data ?? []).map((hero) => [hero.id, hero.name])),
    [heroData],
  );

  const decks = data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <select
          className={SELECT_CLASS}
          value={status}
          onChange={(event) => setStatus(event.target.value as DeckStatus | "")}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {deckStatusSchema.options.map((option) => (
            <option key={option} value={option}>
              {DECK_STATUS_LABELS[option]}
            </option>
          ))}
        </select>
        <FormatPicker teamId={teamId} value={formatId} onChange={setFormatId} />
        <HeroPicker teamId={teamId} value={heroId} onChange={setHeroId} />
        <select
          className={SELECT_CLASS}
          value={reference}
          onChange={(event) => setReference(event.target.value as ReferenceFilter)}
          aria-label="Filter by deck kind"
        >
          <option value="all">All decks</option>
          <option value="false">Our decks</option>
          <option value="true">Reference decks</option>
        </select>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading decks…</p>
      ) : decks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No decks match these filters.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {decks.map((deck) => (
            <li key={deck.id}>
              <Link
                to="/decks/$deckId"
                params={{ deckId: deck.id }}
                className="flex flex-col gap-1 rounded-md border border-border p-3 hover:bg-accent"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{deck.name}</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
                    {DECK_STATUS_LABELS[deck.status]}
                  </span>
                  {deck.visibility === "private" ? (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {DECK_VISIBILITY_LABELS.private}
                    </span>
                  ) : null}
                  {deck.isReference ? (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Reference
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatNames.get(deck.formatId) ?? "Unknown format"}
                  {deck.heroId ? ` · ${heroNames.get(deck.heroId) ?? "Unknown hero"}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
