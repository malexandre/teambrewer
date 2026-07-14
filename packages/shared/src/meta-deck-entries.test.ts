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
  it("requires at least one of a hero or a label", () => {
    // Neither a hero nor a label → rejected.
    expect(createMetaDeckEntrySchema.safeParse({ tier: "contender" }).success).toBe(false);
    // A label alone → accepted.
    expect(createMetaDeckEntrySchema.safeParse({ tier: "fringe", label: "Aggro" }).success).toBe(
      true,
    );
    // A hero alone (no label) → accepted.
    expect(createMetaDeckEntrySchema.safeParse({ tier: "fringe", heroId: "hero_1" }).success).toBe(
      true,
    );
  });

  it("accepts a label with an optional hero qualifier", () => {
    const parsed = createMetaDeckEntrySchema.parse({
      tier: "contender",
      heroId: "hero_1",
      label: "Fatigue Kano",
    });
    expect(parsed.heroId).toBe("hero_1");
    expect(parsed.label).toBe("Fatigue Kano");
  });

  it("defaults notes to an empty string and leaves the hero optional", () => {
    const parsed = createMetaDeckEntrySchema.parse({ tier: "meta_defining", label: "Aggro" });
    expect(parsed.notes).toBe("");
    expect(parsed.heroId).toBeUndefined();
  });
});

describe("updateMetaDeckEntrySchema", () => {
  it("allows changing the tier, label, hero, or notes", () => {
    expect(updateMetaDeckEntrySchema.safeParse({ tier: "fringe" }).success).toBe(true);
    expect(updateMetaDeckEntrySchema.safeParse({ label: "Renamed archetype" }).success).toBe(true);
    expect(updateMetaDeckEntrySchema.safeParse({ heroId: "hero_2" }).success).toBe(true);
    // Passing null clears the hero qualifier.
    expect(updateMetaDeckEntrySchema.safeParse({ heroId: null }).success).toBe(true);
    expect(updateMetaDeckEntrySchema.safeParse({ notes: "watch the go-wide plan" }).success).toBe(
      true,
    );
  });

  it("rejects an empty update", () => {
    expect(updateMetaDeckEntrySchema.safeParse({}).success).toBe(false);
  });
});
