import { describe, expect, it } from "vitest";

import { deriveCardObservationScore } from "./deck-card-observations.js";

describe("deriveCardObservationScore", () => {
  it("is ~+1 for a card impressive in nearly every weighty game (no unflagged games)", () => {
    // 99 impressive + 1 underperforming, all weight 1, flagged in all 100 games.
    expect(
      deriveCardObservationScore({
        impressiveWeight: 99,
        underperformingWeight: 1,
        flaggedGameWeight: 100,
        totalGameWeight: 100,
      }),
    ).toBeCloseTo(0.9608, 3);
  });

  it("is ~-1 for a card that underperforms in nearly every weighty game", () => {
    expect(
      deriveCardObservationScore({
        impressiveWeight: 1,
        underperformingWeight: 99,
        flaggedGameWeight: 100,
        totalGameWeight: 100,
      }),
    ).toBeCloseTo(-0.9608, 3);
  });

  it("is exactly 0 with no signal either way", () => {
    expect(
      deriveCardObservationScore({
        impressiveWeight: 0,
        underperformingWeight: 0,
        flaggedGameWeight: 0,
        totalGameWeight: 40,
      }),
    ).toBe(0);
  });

  it("stays meaningful for a consistently-good card flagged in only a few of many games", () => {
    // Impressive 5× (weight 1) in 5 games, out of 200 weight-1 games total.
    // The 195 unflagged games are counted as neutral but only at 0.1 weight, so the
    // card is no longer diluted to ~0: 5 / (5 + 0.1*195 + 2) = 5 / 26.5.
    expect(
      deriveCardObservationScore({
        impressiveWeight: 5,
        underperformingWeight: 0,
        flaggedGameWeight: 5,
        totalGameWeight: 200,
      }),
    ).toBeCloseTo(0.1887, 3);
  });

  it("hits the -30% target for a card underperforming in 5 of 100 games", () => {
    // The scenario the user cared about: 5 consistently-bad games out of 100.
    expect(
      deriveCardObservationScore({
        impressiveWeight: 0,
        underperformingWeight: 5,
        flaggedGameWeight: 5,
        totalGameWeight: 100,
      }),
    ).toBeCloseTo(-0.303, 3);
  });

  it("discounts, but still counts, unflagged games — more total games lowers the magnitude", () => {
    const few = deriveCardObservationScore({
      impressiveWeight: 5,
      underperformingWeight: 0,
      flaggedGameWeight: 5,
      totalGameWeight: 5, // no unflagged games
    });
    const many = deriveCardObservationScore({
      impressiveWeight: 5,
      underperformingWeight: 0,
      flaggedGameWeight: 5,
      totalGameWeight: 100, // 95 unflagged games, discounted
    });
    expect(few).toBeCloseTo(0.7143, 3);
    expect(many).toBeCloseTo(0.303, 3);
    expect(few).toBeGreaterThan(many);
    expect(many).toBeGreaterThan(0);
  });

  it("matches the no-discount denominator when every relevant game flagged the card", () => {
    // flaggedGameWeight === totalGameWeight → neutral mass is 0 → denominator is just
    // observationWeight + prior. 6 impressive, 2 underperforming across 8 flagged games.
    expect(
      deriveCardObservationScore({
        impressiveWeight: 6,
        underperformingWeight: 2,
        flaggedGameWeight: 8,
        totalGameWeight: 8,
      }),
    ).toBeCloseTo(0.4, 3);
  });

  it("scores impressions in heavy games higher than the same count in low-weight games", () => {
    const heavy = deriveCardObservationScore({
      impressiveWeight: 10, // 10 games at weight 1.0
      underperformingWeight: 0,
      flaggedGameWeight: 10,
      totalGameWeight: 14,
    });
    const light = deriveCardObservationScore({
      impressiveWeight: 4, // 10 games at weight 0.4
      underperformingWeight: 0,
      flaggedGameWeight: 4,
      totalGameWeight: 14,
    });
    expect(heavy).toBeGreaterThan(light);
    expect(light).toBeGreaterThan(0);
  });

  it("keeps thin evidence near neutral — a single low-weight impression barely moves", () => {
    expect(
      deriveCardObservationScore({
        impressiveWeight: 0.4,
        underperformingWeight: 0,
        flaggedGameWeight: 0.4,
        totalGameWeight: 0.4,
      }),
    ).toBeLessThan(0.2);
  });

  it("stays within [-1, 1] and never reaches the extremes through normal accumulation", () => {
    const lopsidedKeep = deriveCardObservationScore({
      impressiveWeight: 1000,
      underperformingWeight: 0,
      flaggedGameWeight: 1000,
      totalGameWeight: 1000,
    });
    const lopsidedCut = deriveCardObservationScore({
      impressiveWeight: 0,
      underperformingWeight: 1000,
      flaggedGameWeight: 1000,
      totalGameWeight: 1000,
    });
    expect(lopsidedKeep).toBeLessThan(1);
    expect(lopsidedKeep).toBeGreaterThan(0.99);
    expect(lopsidedCut).toBeGreaterThan(-1);
    expect(lopsidedCut).toBeLessThan(-0.99);
  });
});
