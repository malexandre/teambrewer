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
    opponentArchetypeLabel: "Aggro Fai",
    body: "Mulligan for Command and Conquer; sequence attacks before defense reactions.",
  };

  it("accepts a label-only opponent subject", () => {
    const parsed = createMatchupGamePlanSchema.parse(base);
    expect(parsed.opponentArchetypeLabel).toBe("Aggro Fai");
    expect(parsed.opponentHeroId).toBeUndefined();
  });

  it("accepts a label with an optional hero qualifier", () => {
    const parsed = createMatchupGamePlanSchema.parse({ ...base, opponentHeroId: "hero_1" });
    expect(parsed.opponentHeroId).toBe("hero_1");
    expect(parsed.opponentArchetypeLabel).toBe("Aggro Fai");
  });

  it("requires the opponent label", () => {
    const { opponentArchetypeLabel, ...withoutLabel } = base;
    void opponentArchetypeLabel;
    expect(createMatchupGamePlanSchema.safeParse(withoutLabel).success).toBe(false);
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

  it("accepts a metaDeckEntryIds-only update (replacement set)", () => {
    expect(
      updateMatchupGamePlanSchema.parse({ metaDeckEntryIds: ["entry_1"] }).metaDeckEntryIds,
    ).toEqual(["entry_1"]);
  });

  it("rejects an empty update", () => {
    expect(() => updateMatchupGamePlanSchema.parse({})).toThrow();
  });

  it("rejects mutating the immutable opponent subject / ourDeckId / formatId", () => {
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
