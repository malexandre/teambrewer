import { describe, expect, it } from "vitest";

import { rankTestingPriorities, type TestingPriorityMatchup } from "./dashboard.js";

/**
 * The dashboard's signature logic: rank an event's gauntlet matchups by
 * `expectedMetaShare × coverageGap` so scarce practice targets the highest-share,
 * thinnest-tested archetypes first (playtesting-methodology §3). These table-driven
 * cases pin the exact order and scores; the math must stay deterministic.
 */

/** Build a matchup with sensible defaults so each case states only what matters. */
function matchup(
  overrides: Partial<TestingPriorityMatchup> & { opponentKey: string },
): TestingPriorityMatchup {
  return {
    opponentLabel: overrides.opponentKey,
    expectedMetaShare: 0,
    effectiveSample: 0,
    trustIndicator: "low",
    ...overrides,
  };
}

describe("rankTestingPriorities", () => {
  it("returns an empty list for an empty gauntlet", () => {
    expect(rankTestingPriorities({ matchups: [] })).toEqual([]);
  });

  it("ranks the higher expected share first when coverage is equal", () => {
    const ranked = rankTestingPriorities({
      matchups: [
        matchup({ opponentKey: "small", expectedMetaShare: 10, effectiveSample: 0 }),
        matchup({ opponentKey: "big", expectedMetaShare: 30, effectiveSample: 0 }),
      ],
      targetEffectiveSample: 15,
    });

    expect(ranked.map((row) => row.opponentKey)).toEqual(["big", "small"]);
    expect(ranked[0]?.normalizedShare).toBe(0.75);
    expect(ranked[0]?.coverageGap).toBe(1);
    expect(ranked[0]?.priorityScore).toBe(0.75);
    expect(ranked[1]?.priorityScore).toBe(0.25);
  });

  it("ranks thinner coverage first when expected share is equal", () => {
    const ranked = rankTestingPriorities({
      matchups: [
        matchup({ opponentKey: "well-tested", expectedMetaShare: 20, effectiveSample: 10 }),
        matchup({ opponentKey: "thin", expectedMetaShare: 20, effectiveSample: 2 }),
      ],
      targetEffectiveSample: 15,
    });

    expect(ranked.map((row) => row.opponentKey)).toEqual(["thin", "well-tested"]);
    expect(ranked[0]?.coverageGap).toBe(0.8667);
    expect(ranked[0]?.priorityScore).toBe(0.4333);
    expect(ranked[1]?.priorityScore).toBe(0.1667);
  });

  it("deprioritizes a well-covered high-share matchup below an under-covered moderate one", () => {
    const ranked = rankTestingPriorities({
      matchups: [
        matchup({ opponentKey: "covered", expectedMetaShare: 40, effectiveSample: 15 }),
        matchup({ opponentKey: "moderate", expectedMetaShare: 20, effectiveSample: 3 }),
      ],
      targetEffectiveSample: 15,
    });

    expect(ranked.map((row) => row.opponentKey)).toEqual(["moderate", "covered"]);
    expect(ranked[0]?.priorityScore).toBe(0.2666);
    // A matchup already at the target sample has no coverage gap → zero priority.
    expect(ranked[1]?.coverageGap).toBe(0);
    expect(ranked[1]?.priorityScore).toBe(0);
  });

  it("breaks ties deterministically by opponent key", () => {
    const ranked = rankTestingPriorities({
      matchups: [
        matchup({ opponentKey: "bravo", expectedMetaShare: 10, effectiveSample: 5 }),
        matchup({ opponentKey: "alpha", expectedMetaShare: 10, effectiveSample: 5 }),
      ],
      targetEffectiveSample: 15,
    });

    expect(ranked.map((row) => row.opponentKey)).toEqual(["alpha", "bravo"]);
  });

  it("falls back to ranking by coverage gap and flags shares unset when every share is zero", () => {
    const ranked = rankTestingPriorities({
      matchups: [
        matchup({ opponentKey: "deep", expectedMetaShare: 0, effectiveSample: 10 }),
        matchup({ opponentKey: "shallow", expectedMetaShare: 0, effectiveSample: 2 }),
      ],
      targetEffectiveSample: 15,
    });

    expect(ranked.map((row) => row.opponentKey)).toEqual(["shallow", "deep"]);
    expect(ranked.every((row) => row.sharesUnset)).toBe(true);
    expect(ranked.every((row) => row.priorityScore === 0)).toBe(true);
    expect(ranked.every((row) => row.normalizedShare === 0)).toBe(true);
  });

  it("defaults the target effective sample to the high-trust threshold (15)", () => {
    const ranked = rankTestingPriorities({
      matchups: [matchup({ opponentKey: "solo", expectedMetaShare: 50, effectiveSample: 3 })],
    });

    // (15 - 3) / 15 = 0.8, normalizedShare 1 → priority 0.8.
    expect(ranked[0]?.coverageGap).toBe(0.8);
    expect(ranked[0]?.priorityScore).toBe(0.8);
  });

  it("carries a human-readable reason mentioning the effective sample", () => {
    const [row] = rankTestingPriorities({
      matchups: [
        matchup({
          opponentKey: "fai",
          opponentLabel: "Fai",
          expectedMetaShare: 30,
          effectiveSample: 4,
        }),
      ],
      targetEffectiveSample: 15,
    });

    expect(row?.reason).toContain("30%");
    expect(row?.reason).toContain("4");
    expect(row?.reason).toContain("15");
  });
});
