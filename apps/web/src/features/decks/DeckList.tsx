import { Link } from "@tanstack/react-router";
import { type DeckStatus, deckStatusSchema } from "@teambrewer/shared";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { useFormats } from "@/features/cards/use-formats";
import { useHeroes } from "@/features/cards/use-heroes";

import {
  DECK_STATUS_LABELS,
  DECK_STATUS_TONE,
  DECK_VISIBILITY_LABELS,
  DECK_VISIBILITY_TONE,
  SELECT_CLASS,
} from "./deck-display";
import { FormatPicker } from "./FormatPicker";
import { HeroPicker } from "./HeroPicker";
import { type DeckFilters, useDecks } from "./use-decks";

/**
 * The team's decks with filters (status, format, hero) and a private/team indicator.
 * Mobile-first; each row links to the deck detail. Format and hero ids are resolved
 * to names via the reference-data hooks.
 */
export function DeckList({ teamId }: { teamId: string | undefined }) {
  const [status, setStatus] = useState<DeckStatus | "">("");
  const [formatId, setFormatId] = useState("");
  const [heroId, setHeroId] = useState("");

  const filters: DeckFilters = {
    ...(status ? { status } : {}),
    ...(formatId ? { formatId } : {}),
    ...(heroId ? { heroId } : {}),
  };

  const { data, isPending } = useDecks(teamId, filters);
  const { data: formatData } = useFormats(teamId);
  const { data: heroData } = useHeroes(teamId);

  const formatNames = useMemo(
    () => new Map((formatData?.data ?? []).map((format) => [format.id, format.name])),
    [formatData],
  );
  const heroesById = useMemo(
    () => new Map((heroData?.data ?? []).map((hero) => [hero.id, hero])),
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
        <HeroPicker
          teamId={teamId}
          formatId={formatId || undefined}
          value={heroId}
          onChange={setHeroId}
        />
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading decks…</p>
      ) : decks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No decks match these filters.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((deck) => {
            const hero = deck.heroId ? heroesById.get(deck.heroId) : undefined;
            return (
              <li key={deck.id}>
                <Link
                  to="/decks/$deckId"
                  params={{ deckId: deck.id }}
                  className="flex h-full gap-2.5 rounded-lg border border-border bg-card p-2.5 shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/40"
                >
                  {/* Hero card art (top-cropped); a name fallback only when there's no image. */}
                  <div className="grid h-[68px] w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted">
                    {hero?.imageUrl ? (
                      <img
                        src={hero.imageUrl}
                        alt={hero.name}
                        className="h-full w-full object-cover object-top"
                      />
                    ) : (
                      <span className="line-clamp-3 px-1 text-center text-[0.65rem] font-medium text-muted-foreground">
                        {hero?.name ?? "No hero"}
                      </span>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span
                      className="line-clamp-2 text-sm font-semibold leading-tight"
                      title={deck.name}
                    >
                      {deck.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {formatNames.get(deck.formatId) ?? "Unknown format"}
                    </span>
                    <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
                      <Badge tone={DECK_STATUS_TONE[deck.status]} size="sm" dot>
                        {DECK_STATUS_LABELS[deck.status]}
                      </Badge>
                      {deck.visibility === "private" ? (
                        <Badge tone={DECK_VISIBILITY_TONE.private} size="sm">
                          {DECK_VISIBILITY_LABELS.private}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
