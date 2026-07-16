import { type RefObject, useLayoutEffect, useState } from "react";

/** A fixed pixel width, or `"anchor"` to match the anchor element's own width. */
export type AnchoredPanelWidth = number | "anchor";

export interface AnchoredPanelPosition {
  left: number;
  top: number;
  width: number;
  placement: "above" | "below";
  maxHeight: number;
}

interface UseAnchoredPanelPositionOptions {
  /** The element the panel is positioned against. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Whether the panel is currently shown (positioning only runs while open). */
  open: boolean;
  width: AnchoredPanelWidth;
  /**
   * A rough panel height used only to decide whether to flip above the anchor when
   * there isn't room below. The returned `maxHeight` clamps to the real available
   * space, so the panel never runs off-screen even if this estimate is off.
   */
  estimatedHeight: number;
  /** Gap between the anchor and the panel. */
  gap?: number;
  /** Keep-off-the-edge margin against the viewport. */
  viewportMargin?: number;
}

/**
 * Computes viewport-aware `fixed` coordinates for a panel anchored to an element,
 * so callers can render that panel through a portal (to `document.body`) and have it
 * escape any `overflow`-clipped ancestor. The panel flips above the anchor when there
 * is no room below (near the viewport bottom), clamps horizontally so it never runs off
 * the edges, and reports a `maxHeight` clamped to the real available space.
 *
 * Shared by the card hover-preview ({@link "../features/cards/CardPreview".CardPreview})
 * and the inline-mention suggestion dropdowns
 * ({@link "../features/collaboration/MentionComposer".MentionComposer}).
 */
export function useAnchoredPanelPosition({
  anchorRef,
  open,
  width,
  estimatedHeight,
  gap = 4,
  viewportMargin = 8,
}: UseAnchoredPanelPositionOptions): AnchoredPanelPosition | null {
  const [position, setPosition] = useState<AnchoredPanelPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) {
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const panelWidth = width === "anchor" ? rect.width : width;

      const maxLeft = window.innerWidth - panelWidth - viewportMargin;
      const left = Math.max(viewportMargin, Math.min(rect.left, maxLeft));

      const spaceBelow = window.innerHeight - rect.bottom - gap - viewportMargin;
      const spaceAbove = rect.top - gap - viewportMargin;
      const placeAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

      setPosition({
        left,
        top: placeAbove ? rect.top - gap : rect.bottom + gap,
        width: panelWidth,
        placement: placeAbove ? "above" : "below",
        maxHeight: Math.max(0, placeAbove ? spaceAbove : spaceBelow),
      });
    }

    updatePosition();
    // Track scroll/resize so the fixed panel follows the anchor while it is open.
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [anchorRef, open, width, estimatedHeight, gap, viewportMargin]);

  return position;
}
