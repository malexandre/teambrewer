import { describe, expect, it } from "vitest";

import {
  createMatchupGamePlanSchema,
  deriveMatchupSubjectRef,
  matchupGamePlanListQuerySchema,
  updateMatchupGamePlanSchema,
} from "./game-plans.js";

describe("createMatchupGamePlanSchema", () => {
  const base = {
    ourDeckId: "deck_1",
    formatId: "format_1",
    name: "vs Defensive",
    body: "Mulligan for Command and Conquer; sequence attacks before defense reactions.",
  };

  it("accepts a free-text name", () => {
    const parsed = createMatchupGamePlanSchema.parse(base);
    expect(parsed.name).toBe("vs Defensive");
  });

  it("requires a non-empty name", () => {
    const { name, ...withoutName } = base;
    void name;
    expect(createMatchupGamePlanSchema.safeParse(withoutName).success).toBe(false);
    expect(createMatchupGamePlanSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
  });

  it("no longer accepts a hero/archetype opponent subject (stripped or rejected)", () => {
    const parsed = createMatchupGamePlanSchema.parse({
      ...base,
      opponentHeroId: "hero_1",
      opponentArchetypeLabel: "Aggro Fai",
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty("opponentHeroId");
    expect(parsed).not.toHaveProperty("opponentArchetypeLabel");
  });

  it("accepts an optional set of attached meta deck entries and rejects duplicates", () => {
    expect(
      createMatchupGamePlanSchema.parse({ ...base, metaDeckEntryIds: ["entry_1", "entry_2"] })
        .metaDeckEntryIds,
    ).toEqual(["entry_1", "entry_2"]);
    expect(
      createMatchupGamePlanSchema.safeParse({ ...base, metaDeckEntryIds: ["entry_1", "entry_1"] })
        .success,
    ).toBe(false);
  });

  it("requires a non-empty body", () => {
    expect(() => createMatchupGamePlanSchema.parse({ ...base, body: "   " })).toThrow();
  });

  it("strips a client-supplied teamId / updatedBy", () => {
    const parsed = createMatchupGamePlanSchema.parse({
      ...base,
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

  it("accepts a name-only update (the name is editable)", () => {
    expect(updateMatchupGamePlanSchema.parse({ name: "vs Control" }).name).toBe("vs Control");
  });

  it("accepts a metaDeckEntryIds-only update (replacement set)", () => {
    expect(
      updateMatchupGamePlanSchema.parse({ metaDeckEntryIds: ["entry_1"] }).metaDeckEntryIds,
    ).toEqual(["entry_1"]);
  });

  it("rejects an empty update", () => {
    expect(() => updateMatchupGamePlanSchema.parse({})).toThrow();
  });

  it("rejects unknown keys (ourDeckId / formatId / opponent subject are not updatable here)", () => {
    expect(() => updateMatchupGamePlanSchema.parse({ opponentHeroId: "hero_2" })).toThrow();
    expect(() => updateMatchupGamePlanSchema.parse({ ourDeckId: "deck_2" })).toThrow();
    expect(() => updateMatchupGamePlanSchema.parse({ formatId: "format_2" })).toThrow();
  });
});

describe("deriveMatchupSubjectRef", () => {
  it("keys a label-only subject by its lowercased label", () => {
    expect(deriveMatchupSubjectRef({ label: "Aggro Fai" })).toBe("label:aggro fai");
    expect(deriveMatchupSubjectRef({ heroId: null, label: "  Aggro Fai  " })).toBe(
      "label:aggro fai",
    );
  });

  it("keys a hero-qualified subject by hero + lowercased label so repeated heroes stay distinct", () => {
    expect(deriveMatchupSubjectRef({ heroId: "hero_1", label: "Fatigue Kano" })).toBe(
      "hero:hero_1|label:fatigue kano",
    );
    expect(deriveMatchupSubjectRef({ heroId: "hero_1", label: "Aggro Kano" })).not.toBe(
      deriveMatchupSubjectRef({ heroId: "hero_1", label: "Fatigue Kano" }),
    );
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
