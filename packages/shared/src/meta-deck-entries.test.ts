import { describe, expect, it } from "vitest";

import {
  META_TIERS,
  META_TIER_LABELS,
  createMetaDeckEntrySchema,
  metaTierSchema,
  updateMetaDeckEntrySchema,
} from "./meta-deck-entries.js";

describe("meta tier enum", () => {
  it("accepts every documented tier", () => {
    for (const tier of ["meta_defining", "contender", "counter_meta", "fringe"] as const) {
      expect(metaTierSchema.parse(tier)).toBe(tier);
    }
  });

  it("rejects an unknown tier", () => {
    expect(() => metaTierSchema.parse("dominant")).toThrow();
  });

  it("exposes the tiers as an ordered array with a label for each", () => {
    expect(META_TIERS).toEqual(["meta_defining", "contender", "counter_meta", "fringe"]);
    for (const tier of META_TIERS) {
      expect(META_TIER_LABELS[tier]).toBeTruthy();
    }
  });
});

describe("createMetaDeckEntrySchema", () => {
  it("accepts exactly one target form", () => {
    expect(
      createMetaDeckEntrySchema.safeParse({ tier: "contender", heroId: "hero_1" }).success,
    ).toBe(true);
    expect(
      createMetaDeckEntrySchema.safeParse({ tier: "fringe", archetypeLabel: "Aggro" }).success,
    ).toBe(true);
  });

  it("rejects zero or multiple target forms", () => {
    expect(createMetaDeckEntrySchema.safeParse({ tier: "contender" }).success).toBe(false);
    expect(
      createMetaDeckEntrySchema.safeParse({
        tier: "contender",
        heroId: "hero_1",
        archetypeLabel: "Aggro",
      }).success,
    ).toBe(false);
  });

  it("defaults notes to an empty string", () => {
    const parsed = createMetaDeckEntrySchema.parse({ tier: "meta_defining", heroId: "hero_1" });
    expect(parsed.notes).toBe("");
  });
});

describe("updateMetaDeckEntrySchema", () => {
  it("allows changing the tier or notes", () => {
    expect(updateMetaDeckEntrySchema.safeParse({ tier: "fringe" }).success).toBe(true);
    expect(updateMetaDeckEntrySchema.safeParse({ notes: "watch the go-wide plan" }).success).toBe(
      true,
    );
  });

  it("rejects an empty update or an attempt to change the target", () => {
    expect(updateMetaDeckEntrySchema.safeParse({}).success).toBe(false);
    expect(updateMetaDeckEntrySchema.safeParse({ heroId: "hero_2" }).success).toBe(false);
  });
});
