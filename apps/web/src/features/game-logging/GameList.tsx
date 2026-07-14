import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { useHeroes } from "@/features/cards/use-heroes";
import { useDecks } from "@/features/decks/use-decks";
import { matchupSubjectDisplayName } from "@/features/metas/meta-display";
import { useMetaDeckEntriesByMeta, useMetas } from "@/features/metas/use-metas";

import {
  describeOpponent,
  describeSelf,
  formatConfidenceWeight,
  formatPlayedAt,
  formatResult,
  type GameLogLabelMaps,
  gameResultTone,
  SELECT_CLASS,
} from "./game-display";
import { type GameFilters, useGames } from "./use-games";

function toNameMap<Item extends { id: string; name: string }>(
  items: Item[],
): Record<string, string> {
  return Object.fromEntries(items.map((item) => [item.id, item.name]));
}

/** Set a filter to `value`, or drop the key entirely when cleared (empty string). */
function withFilter(current: GameFilters, key: keyof GameFilters, value: string): GameFilters {
  const next = { ...current };
  if (value) {
    next[key] = value;
  } else {
    delete next[key];
  }
  return next;
}

/** The team's game logs (filtered), each linking to its detail hub. */
export function GameList({ teamId }: { teamId: string | undefined }) {
  const [filters, setFilters] = useState<GameFilters>({});
  const { data, isPending, error } = useGames(teamId, filters);
  const { data: decks } = useDecks(teamId, {});
  const { data: heroes } = useHeroes(teamId);
  const { data: metas } = useMetas(teamId);
  const metaEntriesById = useMetaDeckEntriesByMeta(
    teamId,
    (metas?.data ?? []).map((meta) => meta.id),
  );

  const maps: GameLogLabelMaps = useMemo(() => {
    const heroesMap = toNameMap(heroes?.data ?? []);
    const metaEntries: Record<string, string> = {};
    for (const entry of metaEntriesById.values()) {
      metaEntries[entry.id] =
        matchupSubjectDisplayName(
          entry.heroId ? heroesMap[entry.heroId] : undefined,
          entry.label,
        ) || entry.opponentSnapshotLabel;
    }
    return { decks: toNameMap(decks?.data ?? []), heroes: heroesMap, metaEntries };
  }, [decks, heroes, metaEntriesById]);

  const deckOptions = decks?.data ?? [];
  const heroOptions = heroes?.data ?? [];
  const metaOptions = metas?.data ?? [];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select
          className={SELECT_CLASS}
          value={filters.deckId ?? ""}
          onChange={(event) =>
            setFilters((current) => withFilter(current, "deckId", event.target.value))
          }
          aria-label="Filter by deck"
        >
          <option value="">All decks</option>
          {deckOptions.map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.name}
            </option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          value={filters.heroId ?? ""}
          onChange={(event) =>
            setFilters((current) => withFilter(current, "heroId", event.target.value))
          }
          aria-label="Filter by opponent hero"
        >
          <option value="">All opponents</option>
          {heroOptions.map((hero) => (
            <option key={hero.id} value={hero.id}>
              {hero.name}
            </option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          value={filters.metaId ?? ""}
          onChange={(event) =>
            setFilters((current) => withFilter(current, "metaId", event.target.value))
          }
          aria-label="Filter by meta"
        >
          <option value="">All metas</option>
          {metaOptions.map((meta) => (
            <option key={meta.id} value={meta.id}>
              {meta.name}
            </option>
          ))}
        </select>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading games…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load games.
        </p>
      ) : data.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No games logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.data.map((game) => (
            <li key={game.id}>
              <Link
                to="/games/$gameLogId"
                params={{ gameLogId: game.id }}
                className="flex flex-col gap-1 rounded-md border border-border p-3 hover:bg-muted"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {describeSelf(game.sideA, maps)} vs {describeOpponent(game.sideB, maps)}
                  </span>
                  <Badge tone={gameResultTone(game.result)}>
                    {formatResult(game.bestOf, game.result)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{formatPlayedAt(game.playedAt)}</span>
                  <span>counts as ~{formatConfidenceWeight(game.confidenceWeight)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
