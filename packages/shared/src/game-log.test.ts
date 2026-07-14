import { describe, expect, it } from "vitest";

import {
  confidenceFactorWeights,
  createGameLogSchema,
  deriveConfidenceWeight,
  isGameResultConsistent,
  updateGameLogSchema,
  type ConfidenceFactors,
} from "./game-log.js";

/** A minimal valid create payload; individual tests override pieces of it. */
function validCreateInput(overrides: Record<string, unknown> = {}) {
  return {
    formatId: "format_cc",
    sideA: { deckId: "deck_ours" },
    sideB: { heroId: "hero_dorinthea", archetypeLabel: "Draconic Dorinthea" },
    firstPlayerSide: "A" as const,
    bestOf: 3 as const,
    result: { gamesWonA: 2, gamesWonB: 1 },
    ...overrides,
  };
}

describe("deriveConfidenceWeight", () => {
  const allBest: ConfidenceFactors = {
    skillParity: "evenly_matched",
    seriousness: "tournament_serious",
    deckMaturity: "both_tuned",
    pilotFamiliarity: "knows_well",
  };
  const allWorst: ConfidenceFactors = {
    skillParity: "major_gap",
    seriousness: "casual",
    deckMaturity: "experimental",
    pilotFamiliarity: "first_time",
  };
  // The documented mixed case from ADR-0005: 0.35*1 + 0.25*1 + 0.25*0.7 + 0.15*0.4 = 0.835.
  const documentedMixed: ConfidenceFactors = {
    skillParity: "evenly_matched",
    seriousness: "tournament_serious",
    deckMaturity: "partially_tuned",
    pilotFamiliarity: "first_time",
  };

  it.each<[string, ConfidenceFactors, number]>([
    ["all-best → 1.0", allBest, 1.0],
    ["all-worst → 0.4 (documented floor)", allWorst, 0.4],
    ["documented mixed case → 0.835", documentedMixed, 0.835],
    [
      "single mid factor",
      { ...allBest, skillParity: "minor_gap" },
      // 0.35*0.7 + 0.25 + 0.25 + 0.15 = 0.895
      0.895,
    ],
  ])("%s", (_label, factors, expected) => {
    expect(deriveConfidenceWeight(factors)).toBeCloseTo(expected, 4);
  });

  it("always yields a weight within [0, 1] across every factor combination", () => {
    const skillParities = ["evenly_matched", "minor_gap", "major_gap"] as const;
    const seriousnesses = ["tournament_serious", "focused_practice", "casual"] as const;
    const deckMaturities = ["both_tuned", "partially_tuned", "experimental"] as const;
    const pilotFamiliarities = ["knows_well", "learning", "first_time"] as const;
    for (const skillParity of skillParities) {
      for (const seriousness of seriousnesses) {
        for (const deckMaturity of deckMaturities) {
          for (const pilotFamiliarity of pilotFamiliarities) {
            const weight = deriveConfidenceWeight({
              skillParity,
              seriousness,
              deckMaturity,
              pilotFamiliarity,
            });
            expect(weight).toBeGreaterThanOrEqual(0);
            expect(weight).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it("weights the four factors per the finalized ADR-0005 split summing to 1", () => {
    const sum =
      confidenceFactorWeights.skillParity +
      confidenceFactorWeights.seriousness +
      confidenceFactorWeights.deckMaturity +
      confidenceFactorWeights.pilotFamiliarity;
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe("isGameResultConsistent", () => {
  it.each<[number, number, number, boolean]>([
    [1, 1, 0, true], // single-game win
    [1, 0, 0, true], // single-game draw
    [1, 1, 1, false], // both cannot win a best-of-1
    [3, 2, 1, true], // clinched best-of-3
    [3, 2, 0, true],
    [3, 1, 1, true], // unfinished best-of-3 (no side at threshold)
    [3, 3, 0, false], // exceeds the win threshold (2)
    [3, 2, 2, false], // both at threshold
    [5, 3, 2, true],
    [5, 3, 3, false],
    [5, 4, 0, false], // exceeds threshold (3)
  ])("bestOf=%i, %i-%i → %s", (bestOf, gamesWonA, gamesWonB, expected) => {
    expect(isGameResultConsistent(bestOf, { gamesWonA, gamesWonB })).toBe(expected);
  });
});

describe("createGameLogSchema", () => {
  it("accepts a minimal valid game and applies confidence-factor defaults", () => {
    const parsed = createGameLogSchema.parse(validCreateInput());
    expect(parsed.confidenceFactors).toEqual({
      skillParity: "evenly_matched",
      seriousness: "tournament_serious",
      deckMaturity: "both_tuned",
      pilotFamiliarity: "knows_well",
    });
    expect(parsed.learnings).toBe("");
  });

  it("ignores a client-supplied confidenceWeight (never an input field)", () => {
    const parsed = createGameLogSchema.parse(validCreateInput({ confidenceWeight: 0.01 }));
    expect(parsed).not.toHaveProperty("confidenceWeight");
  });

  it("rejects a result inconsistent with bestOf", () => {
    expect(() =>
      createGameLogSchema.parse(
        validCreateInput({ bestOf: 3, result: { gamesWonA: 3, gamesWonB: 0 } }),
      ),
    ).toThrow();
  });

  it("rejects a sideB with no subject", () => {
    expect(() => createGameLogSchema.parse(validCreateInput({ sideB: {} }))).toThrow();
  });

  it("rejects a sideB with more than one subject form", () => {
    expect(() =>
      createGameLogSchema.parse(
        validCreateInput({ sideB: { deckId: "deck_theirs", archetypeLabel: "Aggro" } }),
      ),
    ).toThrow();
  });

  it("accepts a hero + label opponent subject", () => {
    const parsed = createGameLogSchema.parse(
      validCreateInput({ sideB: { heroId: "hero_x", archetypeLabel: "Aggro Fai" } }),
    );
    expect(parsed.sideB.heroId).toBe("hero_x");
    expect(parsed.sideB.archetypeLabel).toBe("Aggro Fai");
  });

  it("rejects a hero opponent qualifier without an archetype label", () => {
    expect(() =>
      createGameLogSchema.parse(validCreateInput({ sideB: { heroId: "hero_x" } })),
    ).toThrow();
  });

  it("accepts an explicit opponent player category alongside a deck subject", () => {
    const parsed = createGameLogSchema.parse(
      validCreateInput({ sideB: { playerCategory: "circuit_player", deckId: "deck_theirs" } }),
    );
    expect(parsed.sideB.playerCategory).toBe("circuit_player");
    expect(parsed.sideB.deckId).toBe("deck_theirs");
  });

  it("defaults the player category per side when omitted (self → teammate, opponent → other)", () => {
    const parsed = createGameLogSchema.parse(validCreateInput());
    expect(parsed.sideA.playerCategory).toBe("teammate");
    expect(parsed.sideB.playerCategory).toBe("other");
  });

  it("rejects an opponent with a player category but no subject", () => {
    expect(() =>
      createGameLogSchema.parse(validCreateInput({ sideB: { playerCategory: "other" } })),
    ).toThrow();
  });

  it("accepts a sideA meta-deck-entry subject", () => {
    const parsed = createGameLogSchema.parse(
      validCreateInput({ sideA: { metaDeckEntryId: "entry_1" } }),
    );
    expect(parsed.sideA.metaDeckEntryId).toBe("entry_1");
  });

  it("rejects a sideA with no subject", () => {
    expect(() =>
      createGameLogSchema.parse(validCreateInput({ sideA: { playerCategory: "teammate" } })),
    ).toThrow();
  });
});

describe("updateGameLogSchema", () => {
  it("requires at least one field", () => {
    expect(() => updateGameLogSchema.parse({})).toThrow();
  });

  it("accepts a partial confidence-factor change", () => {
    const parsed = updateGameLogSchema.parse({ confidenceFactors: { seriousness: "casual" } });
    expect(parsed.confidenceFactors).toEqual({ seriousness: "casual" });
  });

  it("rejects unknown keys", () => {
    expect(() => updateGameLogSchema.parse({ confidenceWeight: 0.5 })).toThrow();
  });
});

import {
  gameLogCardInputSchema,
  gameLogCardRoleSchema,
  gameLogCardSideSchema,
} from "./game-log.js";

describe("game-log card capture", () => {
  it("accepts a valid card reference with a side", () => {
    expect(gameLogCardInputSchema.parse({ cardId: "card_1", side: "ours" })).toEqual({
      cardId: "card_1",
      side: "ours",
    });
  });

  it("rejects an unknown side", () => {
    expect(() => gameLogCardInputSchema.parse({ cardId: "card_1", side: "mine" })).toThrow();
  });

  it("rejects a missing cardId", () => {
    expect(() => gameLogCardInputSchema.parse({ side: "ours" })).toThrow();
  });

  it("enumerates roles and sides", () => {
    expect(gameLogCardRoleSchema.options).toEqual(["impressive", "underperforming"]);
    expect(gameLogCardSideSchema.options).toEqual(["ours", "theirs"]);
  });

  it("accepts card arrays on create and defaults them to empty", () => {
    const parsed = createGameLogSchema.parse(validCreateInput());
    expect(parsed.impressiveCards).toEqual([]);
    expect(parsed.underperformingCards).toEqual([]);
  });

  it("accepts card arrays on create when provided", () => {
    const parsed = createGameLogSchema.parse(
      validCreateInput({ impressiveCards: [{ cardId: "c1", side: "ours" }] }),
    );
    expect(parsed.impressiveCards).toEqual([{ cardId: "c1", side: "ours" }]);
  });

  it("accepts a card-array-only update", () => {
    const parsed = updateGameLogSchema.parse({
      underperformingCards: [{ cardId: "c2", side: "theirs" }],
    });
    expect(parsed.underperformingCards).toHaveLength(1);
  });
});
