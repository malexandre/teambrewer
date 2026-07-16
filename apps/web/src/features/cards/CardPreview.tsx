import type { CardSummary } from "@teambrewer/shared";
import { type ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAnchoredPanelPosition } from "@/lib/use-anchored-panel-position";

import { pitchDisplay } from "./pitch";

interface CardPreviewProps {
  card: CardSummary;
  /** The trigger content; defaults to the card name. */
  children?: ReactNode;
}

// The preview panel is a fixed width (Tailwind `w-60`).
const PREVIEW_WIDTH = 240;
// A card image is portrait; this rough height decides whether to flip above the trigger
// when there isn't room below. The panel's max-height is clamped to the real space so it
// never runs off-screen even if the estimate is off.
const ESTIMATED_PREVIEW_HEIGHT = 360;

/**
 * Reveals a card's image on hover (desktop) or press (mobile/keyboard). The image
 * conveys the card's stats and text, so this doubles as the card detail — there
 * is no separate rich detail view in the lean model.
 *
 * The panel is rendered through a portal with viewport-aware fixed positioning: it
 * escapes any `overflow`-clipped ancestor (a section or card), flips above the trigger
 * when there's no room below (near the page bottom), and clamps to the viewport so it is
 * never cut off.
 */
export function CardPreview({ card, children }: CardPreviewProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const position = useAnchoredPanelPosition({
    anchorRef: triggerRef,
    open,
    width: PREVIEW_WIDTH,
    estimatedHeight: ESTIMATED_PREVIEW_HEIGHT,
  });
  const pitch = pitchDisplay(card.pitch);
  const label = pitch ? `${card.name} — ${pitch}` : card.name;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="underline decoration-dotted underline-offset-2"
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
      >
        {children ?? card.name}
      </button>
      {open && position
        ? createPortal(
            <span
              role="dialog"
              aria-label={`${card.name} preview`}
              style={{
                position: "fixed",
                left: position.left,
                top: position.top,
                width: PREVIEW_WIDTH,
                maxHeight: position.maxHeight,
                transform: position.placement === "above" ? "translateY(-100%)" : undefined,
              }}
              className="z-50 flex flex-col gap-1 overflow-y-auto rounded-md border border-border bg-card p-2 shadow-md"
            >
              {card.imageUrl ? (
                <img src={card.imageUrl} alt={card.name} className="w-full rounded" />
              ) : (
                <span className="text-xs text-muted-foreground">No image available</span>
              )}
              <span className="text-sm">{label}</span>
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
