import { describe, expect, it } from "vitest";

import { formatEventDate, formatScore, opponentSummary, OUTCOME_LABELS } from "./dashboard-display";

describe("dashboard-display", () => {
  it("labels every outcome", () => {
    expect(OUTCOME_LABELS.win).toBe("Win");
    expect(OUTCOME_LABELS.loss).toBe("Loss");
    expect(OUTCOME_LABELS.draw).toBe("Draw");
  });

  it("formats the games-won score", () => {
    expect(formatScore({ gamesWonA: 2, gamesWonB: 1 })).toBe("2–1");
  });

  it("prefers a named external opponent, then an archetype, then a neutral fallback", () => {
    expect(
      opponentSummary({
        pilotUserId: null,
        externalOpponentName: "Rival Ana",
        deckId: null,
        heroId: null,
        archetypeLabel: null,
      }),
    ).toBe("Rival Ana");
    expect(
      opponentSummary({
        pilotUserId: null,
        externalOpponentName: null,
        deckId: null,
        heroId: null,
        archetypeLabel: "Aggro Red",
      }),
    ).toBe("Aggro Red");
    expect(
      opponentSummary({
        pilotUserId: "user-1",
        externalOpponentName: null,
        deckId: "deck-1",
        heroId: null,
        archetypeLabel: null,
      }),
    ).toBe("Recorded opponent");
  });

  it("formats an event date and passes through an unparseable one", () => {
    expect(formatEventDate("2026-09-12T00:00:00.000Z")).toContain("2026");
    expect(formatEventDate("not-a-date")).toBe("not-a-date");
  });
});
