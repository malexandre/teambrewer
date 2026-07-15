import { describe, expect, it } from "vitest";

import { deriveCardObservationScore } from "./deck-card-observations.js";

describe("deriveCardObservationScore", () => {
  it("is ~1 for a card impressive in nearly every weighty game", () => {
    // 99 impressive + 1 underperforming, all weight 1, over 100 games.
    expect(
      deriveCardObservationScore({
        impressiveWeight: 99,
        underperformingWeight: 1,
        totalGameWeight: 100,
      }),
    ).toBeCloseTo(0.9804, 3);
  });

  it("is ~0 for a card that underperforms in nearly every weighty game", () => {
    expect(
      deriveCardObservationScore({
        impressiveWeight: 0,
        underperformingWeight: 99,
        totalGameWeight: 100,
      }),
    ).toBeCloseTo(0.0147, 3);
  });

  it("is exactly 0.5 with no signal either way", () => {
    expect(
      deriveCardObservationScore({
        impressiveWeight: 0,
        underperformingWeight: 0,
        totalGameWeight: 40,
      }),
    ).toBe(0.5);
  });

  it("trends toward 0.5 for a card rarely flagged across many games (impact spread thin)", () => {
    // Impressive 5× (weight 1) out of 200 weight-1 games.
    expect(
      deriveCardObservationScore({
        impressiveWeight: 5,
        underperformingWeight: 0,
        totalGameWeight: 200,
      }),
    ).toBeCloseTo(0.5124, 3);
  });

  it("scores impressions in heavy games higher than the same count in low-weight games", () => {
    const heavy = deriveCardObservationScore({
      impressiveWeight: 10, // 10 games at weight 1.0
      underperformingWeight: 0,
      totalGameWeight: 14,
    });
    const light = deriveCardObservationScore({
      impressiveWeight: 4, // 10 games at weight 0.4
      underperformingWeight: 0,
      totalGameWeight: 14,
    });
    expect(heavy).toBeGreaterThan(light);
    expect(light).toBeGreaterThan(0.5);
  });

  it("keeps thin evidence near neutral — a single low-weight impression barely moves", () => {
    expect(
      deriveCardObservationScore({
        impressiveWeight: 0.4,
        underperformingWeight: 0,
        totalGameWeight: 0.4,
      }),
    ).toBeLessThan(0.62);
  });

  it("clamps to [0, 1] even if positive weight exceeds the total (mirror double-count)", () => {
    expect(
      deriveCardObservationScore({
        impressiveWeight: 10,
        underperformingWeight: 0,
        totalGameWeight: 1,
      }),
    ).toBe(1);
  });
});
