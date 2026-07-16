import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAnchoredPanelPosition } from "./use-anchored-panel-position";

// jsdom reports a zeroed rect for every element and defaults to a 1024x768 viewport;
// stub the anchor's rect so the flip/clamp math has a realistic position to react to.
function makeAnchor(rect: { left: number; top: number; width: number; height: number }): {
  current: HTMLElement;
} {
  const element = document.createElement("div");
  document.body.appendChild(element);
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: rect.left,
    y: rect.top,
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height,
    toJSON: () => ({}),
  } as DOMRect);
  return { current: element };
}

describe("useAnchoredPanelPosition", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("returns null while closed", () => {
    const anchorRef = makeAnchor({ left: 20, top: 100, width: 200, height: 16 });
    const { result } = renderHook(() =>
      useAnchoredPanelPosition({ anchorRef, open: false, width: "anchor", estimatedHeight: 160 }),
    );
    expect(result.current).toBeNull();
  });

  it("places the panel below the anchor when there is room", () => {
    const anchorRef = makeAnchor({ left: 20, top: 100, width: 200, height: 16 });
    const { result } = renderHook(() =>
      useAnchoredPanelPosition({ anchorRef, open: true, width: "anchor", estimatedHeight: 160 }),
    );
    expect(result.current?.placement).toBe("below");
    // top = anchor.bottom (116) + gap (4)
    expect(result.current?.top).toBe(120);
  });

  it("flips the panel above the anchor when there is no room below", () => {
    const anchorRef = makeAnchor({ left: 20, top: 740, width: 200, height: 16 });
    const { result } = renderHook(() =>
      useAnchoredPanelPosition({ anchorRef, open: true, width: "anchor", estimatedHeight: 160 }),
    );
    expect(result.current?.placement).toBe("above");
    // top = anchor.top (740) - gap (4)
    expect(result.current?.top).toBe(736);
  });

  it('matches the anchor\'s width when width is "anchor"', () => {
    const anchorRef = makeAnchor({ left: 20, top: 100, width: 200, height: 16 });
    const { result } = renderHook(() =>
      useAnchoredPanelPosition({ anchorRef, open: true, width: "anchor", estimatedHeight: 160 }),
    );
    expect(result.current?.width).toBe(200);
  });

  it("uses a fixed width when given a number", () => {
    const anchorRef = makeAnchor({ left: 20, top: 100, width: 200, height: 16 });
    const { result } = renderHook(() =>
      useAnchoredPanelPosition({ anchorRef, open: true, width: 240, estimatedHeight: 360 }),
    );
    expect(result.current?.width).toBe(240);
  });

  it("clamps the panel horizontally so it never runs off the right edge", () => {
    // Anchor pinned near the right edge of the 1024px-wide viewport.
    const anchorRef = makeAnchor({ left: 1000, top: 100, width: 100, height: 16 });
    const { result } = renderHook(() =>
      useAnchoredPanelPosition({ anchorRef, open: true, width: 240, estimatedHeight: 360 }),
    );
    // maxLeft = innerWidth (1024) - width (240) - viewportMargin (8) = 776
    expect(result.current?.left).toBe(776);
  });

  it("clamps the panel horizontally so it never runs off the left edge", () => {
    const anchorRef = makeAnchor({ left: -50, top: 100, width: 100, height: 16 });
    const { result } = renderHook(() =>
      useAnchoredPanelPosition({ anchorRef, open: true, width: 240, estimatedHeight: 360 }),
    );
    // clamped up to the viewport margin
    expect(result.current?.left).toBe(8);
  });

  it("clamps the max height to the space below the anchor", () => {
    const anchorRef = makeAnchor({ left: 20, top: 100, width: 200, height: 16 });
    const { result } = renderHook(() =>
      useAnchoredPanelPosition({ anchorRef, open: true, width: "anchor", estimatedHeight: 160 }),
    );
    // spaceBelow = innerHeight (768) - anchor.bottom (116) - gap (4) - viewportMargin (8) = 640
    expect(result.current?.maxHeight).toBe(640);
  });
});
