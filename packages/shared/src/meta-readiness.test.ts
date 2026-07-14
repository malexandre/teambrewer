import { describe, expect, it } from "vitest";

import { deckMetaReadinessResponseSchema, deckMetaReadinessRowSchema } from "./meta-readiness.js";

describe("deckMetaReadinessRowSchema", () => {
  it("parses a row that carries the entry's hero id and archetype label", () => {
    const row = deckMetaReadinessRowSchema.parse({
      metaDeckEntryId: "entry-1",
      tier: "meta_defining",
      heroId: "hero-dorinthea",
      label: "Aggro Dorinthea",
      opponentSnapshotLabel: "Dorinthea · Aggro Dorinthea",
      weightedWinRate: 0.6667,
      rawSampleCount: 4,
      effectiveSample: 3,
      trustIndicator: "low",
      hasGamePlan: true,
    });

    expect(row.heroId).toBe("hero-dorinthea");
    expect(row.label).toBe("Aggro Dorinthea");
  });

  it("allows a null hero id and an empty label for a label-only entry", () => {
    const row = deckMetaReadinessRowSchema.parse({
      metaDeckEntryId: "entry-2",
      tier: "contender",
      heroId: null,
      label: "Aggro Red",
      opponentSnapshotLabel: "Aggro Red",
      weightedWinRate: null,
      rawSampleCount: 0,
      effectiveSample: 0,
      trustIndicator: "low",
      hasGamePlan: false,
    });

    expect(row.heroId).toBeNull();
    expect(row.label).toBe("Aggro Red");
  });

  it("rejects a row missing the heroId field", () => {
    const parsed = deckMetaReadinessRowSchema.safeParse({
      metaDeckEntryId: "entry-3",
      tier: "fringe",
      label: "Something",
      opponentSnapshotLabel: "Something",
      weightedWinRate: null,
      rawSampleCount: 0,
      effectiveSample: 0,
      trustIndicator: "low",
      hasGamePlan: false,
    });

    expect(parsed.success).toBe(false);
  });
});

describe("deckMetaReadinessResponseSchema", () => {
  it("parses a full response with hero-carrying rows", () => {
    const response = deckMetaReadinessResponseSchema.parse({
      deckId: "deck-1",
      metaId: "meta-1",
      metaName: "July",
      rows: [
        {
          metaDeckEntryId: "entry-1",
          tier: "meta_defining",
          heroId: "hero-1",
          label: "Aggro",
          opponentSnapshotLabel: "Briar · Aggro",
          weightedWinRate: 0.5,
          rawSampleCount: 2,
          effectiveSample: 2,
          trustIndicator: "low",
          hasGamePlan: false,
        },
      ],
    });

    expect(response.rows[0]?.heroId).toBe("hero-1");
    expect(response.rows[0]?.label).toBe("Aggro");
  });
});
