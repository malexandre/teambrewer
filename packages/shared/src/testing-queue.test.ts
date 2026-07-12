import { describe, expect, it } from "vitest";

import {
  allowedNextCardTestSuggestionStatuses,
  allowedNextTestAssignmentStatuses,
  cardTestSuggestionStatusRequiresResolutionNote,
  cardTestSuggestionStatusSchema,
  cardTestSuggestionStatusTransitions,
  createCardTestSuggestionSchema,
  createTestAssignmentSchema,
  isCardTestSuggestionStatusTransitionAllowed,
  isTestAssignmentStatusTransitionAllowed,
  testAssignmentStatusSchema,
  testAssignmentStatusTransitions,
  updateCardTestSuggestionSchema,
  updateTestAssignmentSchema,
} from "./testing-queue.js";

describe("card-test-suggestion status enum", () => {
  it("accepts every documented status", () => {
    for (const status of ["proposed", "testing", "adopted", "rejected"] as const) {
      expect(cardTestSuggestionStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects an unknown status", () => {
    expect(() => cardTestSuggestionStatusSchema.parse("archived")).toThrow();
  });
});

describe("card-test-suggestion status transitions", () => {
  it("allows the documented lifecycle steps", () => {
    expect(isCardTestSuggestionStatusTransitionAllowed("proposed", "testing")).toBe(true);
    expect(isCardTestSuggestionStatusTransitionAllowed("proposed", "rejected")).toBe(true);
    expect(isCardTestSuggestionStatusTransitionAllowed("testing", "adopted")).toBe(true);
    expect(isCardTestSuggestionStatusTransitionAllowed("testing", "rejected")).toBe(true);
  });

  it("rejects illegal transitions and no-ops", () => {
    expect(isCardTestSuggestionStatusTransitionAllowed("proposed", "adopted")).toBe(false);
    expect(isCardTestSuggestionStatusTransitionAllowed("adopted", "testing")).toBe(false);
    expect(isCardTestSuggestionStatusTransitionAllowed("rejected", "proposed")).toBe(false);
    expect(isCardTestSuggestionStatusTransitionAllowed("testing", "testing")).toBe(false);
  });

  it("treats adopted and rejected as terminal", () => {
    expect(allowedNextCardTestSuggestionStatuses("adopted")).toEqual([]);
    expect(allowedNextCardTestSuggestionStatuses("rejected")).toEqual([]);
  });

  it("returns a fresh mutable copy from allowedNext", () => {
    const next = allowedNextCardTestSuggestionStatuses("proposed");
    next.pop();
    expect(cardTestSuggestionStatusTransitions.proposed).toEqual(["testing", "rejected"]);
  });

  it("requires a resolution note only for adopted / rejected", () => {
    expect(cardTestSuggestionStatusRequiresResolutionNote("adopted")).toBe(true);
    expect(cardTestSuggestionStatusRequiresResolutionNote("rejected")).toBe(true);
    expect(cardTestSuggestionStatusRequiresResolutionNote("proposed")).toBe(false);
    expect(cardTestSuggestionStatusRequiresResolutionNote("testing")).toBe(false);
  });
});

describe("test-assignment status transitions", () => {
  it("accepts every documented status", () => {
    for (const status of ["open", "in_progress", "done", "cancelled"] as const) {
      expect(testAssignmentStatusSchema.parse(status)).toBe(status);
    }
  });

  it("allows the documented lifecycle steps", () => {
    expect(isTestAssignmentStatusTransitionAllowed("open", "in_progress")).toBe(true);
    expect(isTestAssignmentStatusTransitionAllowed("open", "cancelled")).toBe(true);
    expect(isTestAssignmentStatusTransitionAllowed("in_progress", "done")).toBe(true);
    expect(isTestAssignmentStatusTransitionAllowed("in_progress", "cancelled")).toBe(true);
  });

  it("rejects illegal transitions and no-ops", () => {
    expect(isTestAssignmentStatusTransitionAllowed("open", "done")).toBe(false);
    expect(isTestAssignmentStatusTransitionAllowed("done", "in_progress")).toBe(false);
    expect(isTestAssignmentStatusTransitionAllowed("cancelled", "open")).toBe(false);
    expect(isTestAssignmentStatusTransitionAllowed("open", "open")).toBe(false);
  });

  it("treats done and cancelled as terminal", () => {
    expect(allowedNextTestAssignmentStatuses("done")).toEqual([]);
    expect(allowedNextTestAssignmentStatuses("cancelled")).toEqual([]);
    expect(testAssignmentStatusTransitions.open).toEqual(["in_progress", "cancelled"]);
  });
});

describe("createCardTestSuggestionSchema", () => {
  const valid = { deckId: "deck-1", cardInId: "card-in", reasoning: "Improves the Fai matchup." };

  it("accepts a straight add (no card out)", () => {
    const parsed = createCardTestSuggestionSchema.parse(valid);
    expect(parsed.cardOutId).toBeUndefined();
    expect(parsed).not.toHaveProperty("teamId");
    expect(parsed).not.toHaveProperty("status");
  });

  it("accepts a swap (card in over card out)", () => {
    const parsed = createCardTestSuggestionSchema.parse({ ...valid, cardOutId: "card-out" });
    expect(parsed.cardOutId).toBe("card-out");
  });

  it("rejects a swap where the card out equals the card in", () => {
    expect(() =>
      createCardTestSuggestionSchema.parse({ ...valid, cardOutId: "card-in" }),
    ).toThrow();
  });

  it("requires a card to test", () => {
    expect(() =>
      createCardTestSuggestionSchema.parse({ deckId: "deck-1", reasoning: "x" }),
    ).toThrow();
  });

  it("requires reasoning", () => {
    expect(() =>
      createCardTestSuggestionSchema.parse({
        deckId: "deck-1",
        cardInId: "card-in",
        reasoning: "  ",
      }),
    ).toThrow();
  });

  it("strips a spoofed server field", () => {
    const parsed = createCardTestSuggestionSchema.parse({
      ...valid,
      teamId: "team-x",
      authorId: "u",
    });
    expect(parsed).not.toHaveProperty("teamId");
    expect(parsed).not.toHaveProperty("authorId");
  });
});

describe("updateCardTestSuggestionSchema", () => {
  it("rejects an empty update", () => {
    expect(() => updateCardTestSuggestionSchema.parse({})).toThrow();
  });

  it("rejects unknown keys (strict)", () => {
    expect(() => updateCardTestSuggestionSchema.parse({ teamId: "team-x" })).toThrow();
  });

  it("accepts a status change", () => {
    expect(updateCardTestSuggestionSchema.parse({ status: "testing" }).status).toBe("testing");
  });

  it("rejects a swap where the card out equals the card in when both are present", () => {
    expect(() =>
      updateCardTestSuggestionSchema.parse({ cardInId: "card-a", cardOutId: "card-a" }),
    ).toThrow();
  });

  it("allows clearing the card out with null", () => {
    expect(updateCardTestSuggestionSchema.parse({ cardOutId: null }).cardOutId).toBeNull();
  });
});

describe("createTestAssignmentSchema", () => {
  const base = { assigneeId: "user-1", deckId: "deck-1" };

  it("accepts exactly one opponent target (gauntlet entry)", () => {
    const parsed = createTestAssignmentSchema.parse({ ...base, opponentGauntletEntryId: "ge-1" });
    expect(parsed.opponentGauntletEntryId).toBe("ge-1");
    expect(parsed).not.toHaveProperty("teamId");
    expect(parsed).not.toHaveProperty("opponentSnapshotLabel");
  });

  it("accepts a hero target and an archetype-label target", () => {
    expect(
      createTestAssignmentSchema.parse({ ...base, opponentHeroId: "hero-1" }).opponentHeroId,
    ).toBe("hero-1");
    expect(
      createTestAssignmentSchema.parse({ ...base, opponentArchetypeLabel: "Aggro Draconic" })
        .opponentArchetypeLabel,
    ).toBe("Aggro Draconic");
  });

  it("rejects zero opponent targets", () => {
    expect(() => createTestAssignmentSchema.parse({ ...base })).toThrow();
  });

  it("rejects more than one opponent target", () => {
    expect(() =>
      createTestAssignmentSchema.parse({
        ...base,
        opponentHeroId: "hero-1",
        opponentArchetypeLabel: "x",
      }),
    ).toThrow();
  });

  it("requires an assignee and a deck", () => {
    expect(() =>
      createTestAssignmentSchema.parse({ deckId: "deck-1", opponentHeroId: "h" }),
    ).toThrow();
    expect(() =>
      createTestAssignmentSchema.parse({ assigneeId: "u", opponentHeroId: "h" }),
    ).toThrow();
  });

  it("accepts an optional positive target-game count and rejects zero", () => {
    expect(
      createTestAssignmentSchema.parse({ ...base, opponentHeroId: "h", targetGames: 10 })
        .targetGames,
    ).toBe(10);
    expect(() =>
      createTestAssignmentSchema.parse({ ...base, opponentHeroId: "h", targetGames: 0 }),
    ).toThrow();
  });

  it("defaults notes to an empty string", () => {
    expect(createTestAssignmentSchema.parse({ ...base, opponentHeroId: "h" }).notes).toBe("");
  });
});

describe("updateTestAssignmentSchema", () => {
  it("rejects an empty update", () => {
    expect(() => updateTestAssignmentSchema.parse({})).toThrow();
  });

  it("rejects unknown keys (strict), including immutable opponent targets", () => {
    expect(() => updateTestAssignmentSchema.parse({ opponentHeroId: "hero-1" })).toThrow();
    expect(() => updateTestAssignmentSchema.parse({ teamId: "team-x" })).toThrow();
  });

  it("accepts status, assignee, target, and notes changes", () => {
    expect(updateTestAssignmentSchema.parse({ status: "in_progress" }).status).toBe("in_progress");
    expect(updateTestAssignmentSchema.parse({ assigneeId: "user-2" }).assigneeId).toBe("user-2");
    expect(updateTestAssignmentSchema.parse({ targetGames: null }).targetGames).toBeNull();
    expect(updateTestAssignmentSchema.parse({ notes: "focus on go-wide lines" }).notes).toBe(
      "focus on go-wide lines",
    );
  });
});
