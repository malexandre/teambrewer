import type { CardSummary } from "@teambrewer/shared";
import { type ReactNode, useState } from "react";

import { pitchDisplay } from "./pitch";

interface CardPreviewProps {
  card: CardSummary;
  /** The trigger content; defaults to the card name. */
  children?: ReactNode;
}

/**
 * Reveals a card's image on hover (desktop) or press (mobile/keyboard). The image
 * conveys the card's stats and text, so this doubles as the card detail — there
 * is no separate rich detail view in the lean model.
 */
export function CardPreview({ card, children }: CardPreviewProps) {
  const [open, setOpen] = useState(false);
  const pitch = pitchDisplay(card.pitch);
  const label = pitch ? `${card.name} — ${pitch}` : card.name;

  return (
    <span className="relative inline-block" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="underline decoration-dotted underline-offset-2"
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
      >
        {children ?? card.name}
      </button>
      {open && (
        <span
          role="dialog"
          aria-label={`${card.name} preview`}
          className="absolute left-0 top-full z-50 mt-1 flex w-60 flex-col gap-1 rounded-md border border-border bg-card p-2 shadow-md"
        >
          {card.imageUrl ? (
            <img src={card.imageUrl} alt={card.name} className="w-full rounded" />
          ) : (
            <span className="text-xs text-muted-foreground">No image available</span>
          )}
          <span className="text-sm">{label}</span>
        </span>
      )}
    </span>
  );
}
