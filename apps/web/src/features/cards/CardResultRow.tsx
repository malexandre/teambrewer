import type { CardSummary } from "@teambrewer/shared";

import { pitchDisplay } from "./pitch";

/**
 * The shared visual for one card search result: a cropped art thumbnail (top ~60% of the
 * card — title + art, text box clipped), the name, and the pitch. Used by both the
 * CardPicker dropdown and the +card mention suggestions so they look identical.
 *
 * Render it inside the consumer's own clickable row (an option or button) that supplies
 * `flex … justify-between` — this component only fills that row's content.
 */
export function CardResultRow({ card }: { card: CardSummary }) {
  const pitch = pitchDisplay(card.pitch);
  return (
    <>
      <span className="flex min-w-0 items-center gap-2">
        {card.imageUrl ? (
          // Decorative (alt=""): the name text already names the card for readers.
          <img
            src={card.imageUrl}
            alt=""
            loading="lazy"
            className="aspect-[6/5] w-16 shrink-0 rounded-sm border border-border object-cover object-top"
          />
        ) : null}
        <span className="truncate">{card.name}</span>
      </span>
      {pitch ? <span className="shrink-0 text-xs text-muted-foreground">{pitch}</span> : null}
    </>
  );
}
