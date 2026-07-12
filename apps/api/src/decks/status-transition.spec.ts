import type { DeckStatus } from "@teambrewer/shared";
import { describe, expect, it } from "vitest";

import { allowedNextStatuses, assertDeckStatusTransition } from "./status-transition.js";

/**
 * The permissive lifecycle (docs/features/decks.md): free movement in both
 * directions among the three active states; any active state may retire; a
 * retired deck reopens only to `testing`. Every other move — including a no-op —
 * is rejected. This table is the single source of truth for the tests below.
 */
const ALL_STATUSES: DeckStatus[] = ["exploratory", "testing", "tournament_ready", "retired"];

const ALLOWED: Record<DeckStatus, DeckStatus[]> = {
  exploratory: ["testing", "tournament_ready", "retired"],
  testing: ["exploratory", "tournament_ready", "retired"],
  tournament_ready: ["exploratory", "testing", "retired"],
  retired: ["testing"],
};

describe("assertDeckStatusTransition", () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const isAllowed = ALLOWED[from].includes(to);
      it(`${isAllowed ? "allows" : "rejects"} ${from} -> ${to}`, () => {
        if (isAllowed) {
          expect(() => assertDeckStatusTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertDeckStatusTransition(from, to)).toThrow();
        }
      });
    }
  }

  it("rejects a no-op transition (from === to) for every status", () => {
    for (const status of ALL_STATUSES) {
      expect(() => assertDeckStatusTransition(status, status)).toThrow();
    }
  });

  it("blocks reopening a retired deck to anything but testing", () => {
    expect(() => assertDeckStatusTransition("retired", "exploratory")).toThrow();
    expect(() => assertDeckStatusTransition("retired", "tournament_ready")).toThrow();
    expect(() => assertDeckStatusTransition("retired", "testing")).not.toThrow();
  });
});

describe("allowedNextStatuses", () => {
  it("returns the permitted next statuses for each state", () => {
    expect(new Set(allowedNextStatuses("exploratory"))).toEqual(
      new Set(["testing", "tournament_ready", "retired"]),
    );
    expect(new Set(allowedNextStatuses("retired"))).toEqual(new Set(["testing"]));
  });
});
