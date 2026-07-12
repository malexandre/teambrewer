import { describe, expect, it } from "vitest";

import { setDeckSelectionSchema } from "./deck-selections.js";

describe("setDeckSelectionSchema", () => {
  it("accepts a deck with reasoning", () => {
    const parsed = setDeckSelectionSchema.parse({
      deckId: "deck_1",
      reasoning: "Best against the expected aggro field.",
    });
    expect(parsed.deckId).toBe("deck_1");
    expect(parsed.reasoning).toBe("Best against the expected aggro field.");
  });

  it("defaults reasoning to an empty string when omitted", () => {
    expect(setDeckSelectionSchema.parse({ deckId: "deck_1" }).reasoning).toBe("");
  });

  it("requires a deckId", () => {
    expect(() => setDeckSelectionSchema.parse({ reasoning: "x" })).toThrow();
  });

  it("strips a client-supplied locked / userId", () => {
    const parsed = setDeckSelectionSchema.parse({
      deckId: "deck_1",
      locked: true,
      userId: "user_forged",
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty("locked");
    expect(parsed).not.toHaveProperty("userId");
  });
});
