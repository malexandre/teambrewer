import type { CardTestSuggestionStatus } from "@teambrewer/shared";
import { describe, expect, it } from "vitest";

import {
  allowedNextStatuses,
  assertResolutionNotePresent,
  assertSuggestionStatusTransition,
} from "./suggestion-status-transition.js";

/**
 * The card-test-suggestion lifecycle (docs/features/testing-queue.md):
 * `proposed → testing → adopted | rejected`, with a `proposed → rejected` dismissal
 * shortcut. `adopted` and `rejected` are terminal. Every other move — including a
 * no-op — is rejected. This table is the single source of truth for the tests below.
 */
const ALL_STATUSES: CardTestSuggestionStatus[] = ["proposed", "testing", "adopted", "rejected"];

const ALLOWED: Record<CardTestSuggestionStatus, CardTestSuggestionStatus[]> = {
  proposed: ["testing", "rejected"],
  testing: ["adopted", "rejected"],
  adopted: [],
  rejected: [],
};

describe("assertSuggestionStatusTransition", () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const isAllowed = ALLOWED[from].includes(to);
      it(`${isAllowed ? "allows" : "rejects"} ${from} -> ${to}`, () => {
        if (isAllowed) {
          expect(() => assertSuggestionStatusTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertSuggestionStatusTransition(from, to)).toThrow();
        }
      });
    }
  }

  it("rejects a no-op transition (from === to) for every status", () => {
    for (const status of ALL_STATUSES) {
      expect(() => assertSuggestionStatusTransition(status, status)).toThrow();
    }
  });
});

describe("allowedNextStatuses", () => {
  it("returns the permitted next statuses for each state", () => {
    expect(allowedNextStatuses("proposed")).toEqual(["testing", "rejected"]);
    expect(allowedNextStatuses("testing")).toEqual(["adopted", "rejected"]);
    expect(allowedNextStatuses("adopted")).toEqual([]);
    expect(allowedNextStatuses("rejected")).toEqual([]);
  });
});

describe("assertResolutionNotePresent", () => {
  it("requires a non-empty note when resolving to adopted or rejected", () => {
    expect(() => assertResolutionNotePresent("adopted", "")).toThrow();
    expect(() => assertResolutionNotePresent("rejected", "   ")).toThrow();
    expect(() => assertResolutionNotePresent("adopted", "worked great")).not.toThrow();
  });

  it("does not require a note for non-resolving statuses", () => {
    expect(() => assertResolutionNotePresent("proposed", "")).not.toThrow();
    expect(() => assertResolutionNotePresent("testing", "")).not.toThrow();
  });
});
