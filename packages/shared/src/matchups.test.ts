import { describe, expect, it } from "vitest";

import {
  DEFAULT_COVERAGE_MIN_EFFECTIVE_SAMPLE,
  MATCHUP_TRUST_THRESHOLDS,
  aggregateMatchup,
  compareCoverageByPriority,
  deriveGameOutcome,
  isUnderCovered,
  normalizeExpectedShares,
  trustIndicator,
  type GameOutcome,
  type MatchupGame,
} from "./matchups.js";

describe("deriveGameOutcome", () => {
  it.each<[string, number, number, GameOutcome]>([
    ["A wins the match", 2, 1, "win"],
    ["B wins the match", 1, 2, "loss"],
    ["single-game win", 1, 0, "win"],
    ["single-game loss", 0, 1, "loss"],
    ["single-game draw (0-0)", 0, 0, "draw"],
    ["match draw (1-1)", 1, 1, "draw"],
  ])("%s", (_label, gamesWonA, gamesWonB, expected) => {
    expect(deriveGameOutcome({ gamesWonA, gamesWonB })).toBe(expected);
  });
});

describe("trustIndicator", () => {
  it.each<[string, number, string]>([
    ["zero → low", 0, "low"],
    ["just below medium → low", 4.99, "low"],
    ["at medium boundary → medium", MATCHUP_TRUST_THRESHOLDS.medium, "medium"],
    ["just below high → medium", 14.99, "medium"],
    ["at high boundary → high", MATCHUP_TRUST_THRESHOLDS.high, "high"],
    ["well above high → high", 42, "high"],
    ["the worked example (2.4) → low", 2.4, "low"],
  ])("%s", (_label, effectiveSample, expected) => {
    expect(trustIndicator(effectiveSample)).toBe(expected);
  });
});

describe("aggregateMatchup", () => {
  const game = (outcome: GameOutcome, weight: number): MatchupGame => ({ outcome, weight });

  it("computes the plan's crafted dataset exactly", () => {
    // weights [1.0, 1.0, 0.5, 0.5, 0.2], wins [1,0,1,0,1] → all decisive.
    // effective = 3.2; weighted win rate = (1.0+0.5+0.2)/3.2 = 1.7/3.2 = 0.53125.
    const result = aggregateMatchup([
      game("win", 1.0),
      game("loss", 1.0),
      game("win", 0.5),
      game("loss", 0.5),
      game("win", 0.2),
    ]);
    expect(result.rawSampleCount).toBe(5);
    expect(result.effectiveSample).toBeCloseTo(3.2, 4);
    expect(result.weightedWinRate).toBeCloseTo(0.5313, 4);
    expect(result.trustIndicator).toBe("low");
  });

  it("computes the feature-spec worked example (N=4, effective 2.4, ≈0.792, low)", () => {
    // Kassai vs Fang: wins 0.9, 0.8, loss 0.5, win 0.2.
    const result = aggregateMatchup([
      game("win", 0.9),
      game("win", 0.8),
      game("loss", 0.5),
      game("win", 0.2),
    ]);
    expect(result.rawSampleCount).toBe(4);
    expect(result.effectiveSample).toBeCloseTo(2.4, 4);
    expect(result.weightedWinRate).toBeCloseTo(0.7917, 4);
    expect(result.trustIndicator).toBe("low");
  });

  it("reads a single high-confidence win as untrusted over a tiny sample", () => {
    const result = aggregateMatchup([game("win", 1.0)]);
    expect(result.rawSampleCount).toBe(1);
    expect(result.effectiveSample).toBeCloseTo(1.0, 4);
    expect(result.weightedWinRate).toBe(1);
    expect(result.trustIndicator).toBe("low");
  });

  it("returns a defined empty result for zero games (no division by zero)", () => {
    const result = aggregateMatchup([]);
    expect(result.rawSampleCount).toBe(0);
    expect(result.effectiveSample).toBe(0);
    expect(result.weightedWinRate).toBeNull();
    expect(result.trustIndicator).toBe("low");
  });

  it("excludes a draw from the numerator and the effective sample but counts it in raw N", () => {
    // 1 win (1.0), 1 draw (1.0), 1 loss (1.0): decisive weight = 2.0, win weight = 1.0.
    const result = aggregateMatchup([game("win", 1.0), game("draw", 1.0), game("loss", 1.0)]);
    expect(result.rawSampleCount).toBe(3);
    expect(result.effectiveSample).toBeCloseTo(2.0, 4);
    expect(result.weightedWinRate).toBeCloseTo(0.5, 4);
  });

  it("returns a null win rate when every game is a draw (still counted in raw N)", () => {
    const result = aggregateMatchup([game("draw", 1.0), game("draw", 0.7)]);
    expect(result.rawSampleCount).toBe(2);
    expect(result.effectiveSample).toBe(0);
    expect(result.weightedWinRate).toBeNull();
    expect(result.trustIndicator).toBe("low");
  });

  it("reaches high trust once the effective sample clears the threshold", () => {
    const games = Array.from({ length: 16 }, () => game("win", 1.0));
    const result = aggregateMatchup(games);
    expect(result.effectiveSample).toBeCloseTo(16, 4);
    expect(result.trustIndicator).toBe("high");
    expect(result.weightedWinRate).toBe(1);
  });
});

describe("normalizeExpectedShares", () => {
  it("normalizes raw shares so they sum to 1", () => {
    const normalized = normalizeExpectedShares([30, 20, 50]);
    expect(normalized).toEqual([0.3, 0.2, 0.5]);
    expect(normalized.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 4);
  });

  it("guards a zero total (all shares → 0, no division by zero)", () => {
    expect(normalizeExpectedShares([0, 0])).toEqual([0, 0]);
  });

  it("handles an empty list", () => {
    expect(normalizeExpectedShares([])).toEqual([]);
  });
});

describe("isUnderCovered", () => {
  it("flags an effective sample below the threshold", () => {
    expect(isUnderCovered(4.9, 5)).toBe(true);
    expect(isUnderCovered(5, 5)).toBe(false);
    expect(isUnderCovered(20, DEFAULT_COVERAGE_MIN_EFFECTIVE_SAMPLE)).toBe(false);
    expect(isUnderCovered(10, DEFAULT_COVERAGE_MIN_EFFECTIVE_SAMPLE)).toBe(true);
  });
});

describe("compareCoverageByPriority", () => {
  it("orders by normalized expected share descending", () => {
    const rows = [
      { normalizedShare: 0.2, effectiveSample: 1 },
      { normalizedShare: 0.5, effectiveSample: 8 },
      { normalizedShare: 0.3, effectiveSample: 3 },
    ];
    const ordered = [...rows].sort(compareCoverageByPriority).map((row) => row.normalizedShare);
    expect(ordered).toEqual([0.5, 0.3, 0.2]);
  });

  it("breaks ties by the thinner (lower) effective sample first", () => {
    const rows = [
      { normalizedShare: 0.4, effectiveSample: 9 },
      { normalizedShare: 0.4, effectiveSample: 2 },
    ];
    const ordered = [...rows].sort(compareCoverageByPriority).map((row) => row.effectiveSample);
    expect(ordered).toEqual([2, 9]);
  });
});
