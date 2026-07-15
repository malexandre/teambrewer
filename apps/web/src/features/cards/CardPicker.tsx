import type { CardSummary } from "@teambrewer/shared";
import { useState } from "react";

import {
  Combobox,
  ComboboxItem,
  ComboboxList,
  ComboboxPopover,
  ComboboxProvider,
} from "@/components/ui/combobox";

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
 * is referenced. Shows name + pitch (with FaB color) for each result. Selecting a
 * card clears the search so the next lookup starts fresh.
 */
export function CardPicker({ teamId, onSelect, placeholder }: CardPickerProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query).trim();
  const { data, isFetching } = useCardSearch(
    teamId,
    { query: debouncedQuery },
    { enabled: debouncedQuery.length > 0 },
  );
  // Gate on the live query too so clearing on select collapses the list immediately,
  // without waiting for the debounce to catch up.
  const results = query.trim().length > 0 && debouncedQuery.length > 0 ? (data?.data ?? []) : [];

  return (
    <ComboboxProvider value={query} setValue={setQuery}>
      <div className="relative">
        <Combobox
          autoSelect
          aria-label="Search cards"
          aria-busy={isFetching}
          placeholder={placeholder ?? "Search cards…"}
        />
        {results.length > 0 && (
          <ComboboxPopover>
            <ComboboxList>
              {results.map((card) => {
                const pitch = pitchDisplay(card.pitch);
                return (
                  <ComboboxItem
                    key={card.id}
                    value={card.id}
                    setValueOnClick={false}
                    className="justify-between"
                    onClick={() => {
                      onSelect?.(card);
                      setQuery("");
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {card.imageUrl ? (
                        // A small card image so visual users can recognise the card at a
                        // glance. Decorative (alt=""): the name text names it for readers.
                        <img
                          src={card.imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-14 w-auto max-w-12 shrink-0 rounded-sm border border-border"
                        />
                      ) : null}
                      <span className="truncate">{card.name}</span>
                    </span>
                    {pitch && (
                      <span className="shrink-0 text-xs text-muted-foreground">{pitch}</span>
                    )}
                  </ComboboxItem>
                );
              })}
            </ComboboxList>
          </ComboboxPopover>
        )}
      </div>
    </ComboboxProvider>
  );
}
