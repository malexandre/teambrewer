import { describe, expect, it } from "vitest";

import {
  buildSideAInput,
  buildSideBInput,
  emptyMatchupSubjectState,
  isSubjectComplete,
  type MatchupSubjectState,
  subjectStateFromSideA,
  subjectStateFromSideB,
} from "./matchup-subject";

function stateWith(overrides: Partial<MatchupSubjectState>): MatchupSubjectState {
  return { ...emptyMatchupSubjectState("team_deck"), ...overrides };
}

describe("matchup subject helpers", () => {
  describe("buildSideAInput — mode → fields", () => {
    it("team_deck emits a deckId and drops the other subject forms", () => {
      const input = buildSideAInput(stateWith({ mode: "team_deck", deckId: "deck-1" }));
      expect(input).toEqual({ deckId: "deck-1" });
    });

    it("meta_deck emits a metaDeckEntryId", () => {
      const input = buildSideAInput(stateWith({ mode: "meta_deck", metaDeckEntryId: "entry-1" }));
      expect(input).toEqual({ metaDeckEntryId: "entry-1" });
    });

    it("hero_label emits the trimmed label plus the optional hero qualifier", () => {
      const input = buildSideAInput(
        stateWith({ mode: "hero_label", archetypeLabel: "  Aggro Red  ", heroId: "hero-1" }),
      );
      expect(input).toEqual({ archetypeLabel: "Aggro Red", heroId: "hero-1" });
    });

    it("hero_label without a hero emits the label alone", () => {
      const input = buildSideAInput(stateWith({ mode: "hero_label", archetypeLabel: "Combo" }));
      expect(input).toEqual({ archetypeLabel: "Combo" });
    });

    it("attaches the optional pilot independently of the subject", () => {
      const input = buildSideAInput(
        stateWith({ mode: "team_deck", deckId: "deck-1", pilotUserId: "user-1" }),
      );
      expect(input).toEqual({ deckId: "deck-1", pilotUserId: "user-1" });
    });

    it("returns null when the subject is incomplete", () => {
      expect(buildSideAInput(stateWith({ mode: "team_deck", deckId: "" }))).toBeNull();
      expect(buildSideAInput(stateWith({ mode: "meta_deck", metaDeckEntryId: "" }))).toBeNull();
      expect(buildSideAInput(stateWith({ mode: "hero_label", archetypeLabel: "   " }))).toBeNull();
    });
  });

  describe("buildSideBInput — opponent extras", () => {
    it("attaches the optional teammate pilot and external name independently", () => {
      const input = buildSideBInput(
        stateWith({
          mode: "hero_label",
          archetypeLabel: "Aggro Red",
          pilotUserId: "mate-1",
          externalOpponentName: "  Joe  ",
        }),
      );
      expect(input).toEqual({
        archetypeLabel: "Aggro Red",
        pilotUserId: "mate-1",
        externalOpponentName: "Joe",
      });
    });

    it("does not force a team deck when only a teammate is named", () => {
      const input = buildSideBInput(
        stateWith({ mode: "hero_label", archetypeLabel: "Aggro Red", pilotUserId: "mate-1" }),
      );
      expect(input).toEqual({ archetypeLabel: "Aggro Red", pilotUserId: "mate-1" });
      expect(input).not.toHaveProperty("deckId");
    });

    it("returns null when the opponent subject is incomplete", () => {
      expect(buildSideBInput(stateWith({ mode: "hero_label", archetypeLabel: "" }))).toBeNull();
    });
  });

  describe("isSubjectComplete", () => {
    it("is false for an empty team-deck state and true once a deck is chosen", () => {
      expect(isSubjectComplete(emptyMatchupSubjectState("team_deck"))).toBe(false);
      expect(isSubjectComplete(stateWith({ mode: "team_deck", deckId: "deck-1" }))).toBe(true);
    });
  });

  describe("seeding from a stored log (edit mode)", () => {
    it("seeds side A into team-deck mode with its pilot", () => {
      const state = subjectStateFromSideA({
        pilotUserId: "user-1",
        deckId: "deck-1",
        metaDeckEntryId: null,
        heroId: null,
        archetypeLabel: null,
      });
      expect(state.mode).toBe("team_deck");
      expect(state.deckId).toBe("deck-1");
      expect(state.pilotUserId).toBe("user-1");
    });

    it("defaults side A to team deck with the fallback pilot when absent", () => {
      const state = subjectStateFromSideA(undefined, "me");
      expect(state.mode).toBe("team_deck");
      expect(state.pilotUserId).toBe("me");
    });

    it("seeds side B into meta-deck mode", () => {
      const state = subjectStateFromSideB({
        pilotUserId: null,
        externalOpponentName: null,
        deckId: null,
        metaDeckEntryId: "entry-9",
        heroId: null,
        archetypeLabel: null,
      });
      expect(state.mode).toBe("meta_deck");
      expect(state.metaDeckEntryId).toBe("entry-9");
    });

    it("seeds side B into hero+label mode with the external name and pilot", () => {
      const state = subjectStateFromSideB({
        pilotUserId: "mate-1",
        externalOpponentName: "Rival",
        deckId: null,
        metaDeckEntryId: null,
        heroId: "hero-1",
        archetypeLabel: "Draconic Dorinthea",
      });
      expect(state.mode).toBe("hero_label");
      expect(state.heroId).toBe("hero-1");
      expect(state.archetypeLabel).toBe("Draconic Dorinthea");
      expect(state.pilotUserId).toBe("mate-1");
      expect(state.externalOpponentName).toBe("Rival");
    });

    it("defaults side B to hero+label when absent", () => {
      expect(subjectStateFromSideB(undefined).mode).toBe("hero_label");
    });
  });
});
