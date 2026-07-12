import type { CardSummary } from "@teambrewer/shared";
import { useState } from "react";

import { Input } from "@/components/ui/input";

import { pitchDisplay } from "./pitch";
import { useCardSearch } from "./use-card-search";
import { useDebouncedValue } from "./use-debounced-value";

interface CardPickerProps {
  /** The active team; results are the team's game (sent as X-Team-Id server-side). */
  teamId: string | undefined;
  /** Called when a card is chosen from the results. */
  onSelect?: (card: CardSummary) => void;
  placeholder?: string;
}

/**
 * Debounced card autocomplete for the active team's game, reused wherever a card
 * is referenced. Shows name + pitch (with FaB color) for each result.
 */
export function CardPicker({ teamId, onSelect, placeholder }: CardPickerProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query).trim();
  const { data, isFetching } = useCardSearch(
    teamId,
    { query: debouncedQuery },
    { enabled: debouncedQuery.length > 0 },
  );
  const results = debouncedQuery.length > 0 ? (data?.data ?? []) : [];

  return (
    <div className="relative">
      <Input
        type="search"
        role="combobox"
        aria-label="Search cards"
        aria-expanded={results.length > 0}
        aria-busy={isFetching}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder ?? "Search cards…"}
      />
      {results.length > 0 && (
        <ul
          role="listbox"
          className="mt-1 max-h-72 overflow-auto rounded-md border border-border bg-card"
        >
          {results.map((card) => {
            const pitch = pitchDisplay(card.pitch);
            return (
              <li key={card.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => onSelect?.(card)}
                >
                  <span>{card.name}</span>
                  {pitch && <span className="text-xs text-muted-foreground">{pitch}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
