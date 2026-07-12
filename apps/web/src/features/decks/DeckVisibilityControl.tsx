import { type DeckVisibility, deckVisibilitySchema } from "@teambrewer/shared";

import { DECK_VISIBILITY_LABELS, SELECT_CLASS } from "./deck-display";

/** Native team/private visibility selector. */
export function DeckVisibilityControl({
  value,
  onChange,
  id,
}: {
  value: DeckVisibility;
  onChange: (visibility: DeckVisibility) => void;
  id?: string;
}) {
  return (
    <select
      id={id}
      className={SELECT_CLASS}
      value={value}
      onChange={(event) => onChange(event.target.value as DeckVisibility)}
      aria-label="Visibility"
    >
      {deckVisibilitySchema.options.map((visibility) => (
        <option key={visibility} value={visibility}>
          {DECK_VISIBILITY_LABELS[visibility]}
        </option>
      ))}
    </select>
  );
}
