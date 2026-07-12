import { describe, expect, it } from "vitest";

import {
  createMatchupGamePlanSchema,
  matchupGamePlanListQuerySchema,
  updateMatchupGamePlanSchema,
} from "./game-plans.js";

describe("createMatchupGamePlanSchema", () => {
  const base = {
    ourDeckId: "deck_1",
    formatId: "format_1",
    body: "Mulligan for Command and Conquer; sequence attacks before defense reactions.",
  };

  it("accepts a plan targeting exactly one opponent form (gauntlet entry)", () => {
    const parsed = createMatchupGamePlanSchema.parse({
      ...base,
      opponentGauntletEntryId: "gauntlet_1",
      keyCardIds: ["card_1", "card_2"],
    });
    expect(parsed.opponentGauntletEntryId).toBe("gauntlet_1");
    expect(parsed.keyCardIds).toEqual(["card_1", "card_2"]);
  });

  it("accepts a plan targeting a bare hero", () => {
    const parsed = createMatchupGamePlanSchema.parse({ ...base, opponentHeroId: "hero_1" });
    expect(parsed.opponentHeroId).toBe("hero_1");
    // keyCardIds defaults to an empty list when omitted.
    expect(parsed.keyCardIds).toEqual([]);
  });

  it("accepts a plan targeting a free-text archetype label", () => {
    const parsed = createMatchupGamePlanSchema.parse({
      ...base,
      opponentArchetypeLabel: "Aggro Fai",
    });
    expect(parsed.opponentArchetypeLabel).toBe("Aggro Fai");
  });

  it("rejects a plan with no opponent target", () => {
    expect(() => createMatchupGamePlanSchema.parse(base)).toThrow();
  });

  it("rejects a plan with more than one opponent target", () => {
    expect(() =>
      createMatchupGamePlanSchema.parse({
        ...base,
        opponentHeroId: "hero_1",
        opponentArchetypeLabel: "Aggro Fai",
      }),
    ).toThrow();
  });

  it("requires a non-empty body", () => {
    expect(() =>
      createMatchupGamePlanSchema.parse({ ...base, body: "   ", opponentHeroId: "hero_1" }),
    ).toThrow();
  });

  it("rejects duplicate key card ids", () => {
    expect(() =>
      createMatchupGamePlanSchema.parse({
        ...base,
        opponentHeroId: "hero_1",
        keyCardIds: ["card_1", "card_1"],
      }),
    ).toThrow();
  });

  it("strips a client-supplied teamId / updatedBy", () => {
    const parsed = createMatchupGamePlanSchema.parse({
      ...base,
      opponentHeroId: "hero_1",
      teamId: "team_forged",
      updatedById: "user_forged",
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty("teamId");
    expect(parsed).not.toHaveProperty("updatedById");
  });
});

describe("updateMatchupGamePlanSchema", () => {
  it("accepts a body-only update", () => {
    expect(updateMatchupGamePlanSchema.parse({ body: "Revised line." }).body).toBe("Revised line.");
  });

  it("accepts a key-cards-only update (replacement set)", () => {
    expect(updateMatchupGamePlanSchema.parse({ keyCardIds: ["card_9"] }).keyCardIds).toEqual([
      "card_9",
    ]);
  });

  it("rejects an empty update", () => {
    expect(() => updateMatchupGamePlanSchema.parse({})).toThrow();
  });

  it("rejects mutating the immutable opponent target", () => {
    expect(() => updateMatchupGamePlanSchema.parse({ opponentHeroId: "hero_2" })).toThrow();
  });

  it("rejects mutating the immutable ourDeckId / formatId", () => {
    expect(() => updateMatchupGamePlanSchema.parse({ ourDeckId: "deck_2" })).toThrow();
    expect(() => updateMatchupGamePlanSchema.parse({ formatId: "format_2" })).toThrow();
  });
});

describe("matchupGamePlanListQuerySchema", () => {
  it("defaults the limit and accepts filters", () => {
    const parsed = matchupGamePlanListQuerySchema.parse({ ourDeckId: "deck_1" });
    expect(parsed.limit).toBe(20);
    expect(parsed.ourDeckId).toBe("deck_1");
  });

  it("coerces a string limit", () => {
    expect(matchupGamePlanListQuerySchema.parse({ limit: "5" }).limit).toBe(5);
  });
});
