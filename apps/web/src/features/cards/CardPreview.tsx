import type { CardSummary } from "@teambrewer/shared";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { pitchDisplay } from "./pitch";

interface CardPreviewProps {
  card: CardSummary;
  /** The trigger content; defaults to the card name. */
  children?: ReactNode;
}

// The preview panel is a fixed width (Tailwind `w-60`); the gap and margins keep it
// off the trigger and off the viewport edges.
const PREVIEW_WIDTH = 240;
const TRIGGER_GAP = 4;
const VIEWPORT_MARGIN = 8;
// A card image is portrait; this rough height decides whether to flip above the trigger
// when there isn't room below. The panel's max-height is clamped to the real space so it
// never runs off-screen even if the estimate is off.
const ESTIMATED_PREVIEW_HEIGHT = 360;

interface PreviewPosition {
  left: number;
  top: number;
  placement: "above" | "below";
  maxHeight: number;
}

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
  const [position, setPosition] = useState<PreviewPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pitch = pitchDisplay(card.pitch);
  const label = pitch ? `${card.name} — ${pitch}` : card.name;

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }
      const rect = trigger.getBoundingClientRect();

      const maxLeft = window.innerWidth - PREVIEW_WIDTH - VIEWPORT_MARGIN;
      const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft));

      const spaceBelow = window.innerHeight - rect.bottom - TRIGGER_GAP - VIEWPORT_MARGIN;
      const spaceAbove = rect.top - TRIGGER_GAP - VIEWPORT_MARGIN;
      const placeAbove = spaceBelow < ESTIMATED_PREVIEW_HEIGHT && spaceAbove > spaceBelow;

      setPosition({
        left,
        top: placeAbove ? rect.top - TRIGGER_GAP : rect.bottom + TRIGGER_GAP,
        placement: placeAbove ? "above" : "below",
        maxHeight: Math.max(0, placeAbove ? spaceAbove : spaceBelow),
      });
    }

    updatePosition();
    // Track scroll/resize so the fixed panel follows the trigger while it is open.
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

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
