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
    it("team_deck emits a deckId (with the player category) and drops the other forms", () => {
      const input = buildSideAInput(
        stateWith({ mode: "team_deck", deckId: "deck-1", playerCategory: "teammate" }),
      );
      expect(input).toEqual({ deckId: "deck-1", playerCategory: "teammate" });
    });

    it("meta_deck emits a metaDeckEntryId", () => {
      const input = buildSideAInput(stateWith({ mode: "meta_deck", metaDeckEntryId: "entry-1" }));
      expect(input).toEqual({ metaDeckEntryId: "entry-1", playerCategory: "other" });
    });

    it("hero_label emits the trimmed label plus the optional hero qualifier", () => {
      const input = buildSideAInput(
        stateWith({
          mode: "hero_label",
          archetypeLabel: "  Aggro Red  ",
          heroId: "hero-1",
          playerCategory: "circuit_player",
        }),
      );
      expect(input).toEqual({
        archetypeLabel: "Aggro Red",
        heroId: "hero-1",
        playerCategory: "circuit_player",
      });
    });

    it("returns null when the subject is incomplete", () => {
      expect(buildSideAInput(stateWith({ mode: "team_deck", deckId: "" }))).toBeNull();
      expect(buildSideAInput(stateWith({ mode: "meta_deck", metaDeckEntryId: "" }))).toBeNull();
      expect(buildSideAInput(stateWith({ mode: "hero_label", archetypeLabel: "   " }))).toBeNull();
    });
  });

  describe("buildSideBInput — opponent player category", () => {
    it("attaches the player category independently of the subject", () => {
      const input = buildSideBInput(
        stateWith({ mode: "hero_label", archetypeLabel: "Aggro Red", playerCategory: "other" }),
      );
      expect(input).toEqual({ archetypeLabel: "Aggro Red", playerCategory: "other" });
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
    it("seeds side A into team-deck mode with its player category", () => {
      const state = subjectStateFromSideA({
        playerCategory: "teammate",
        deckId: "deck-1",
        metaDeckEntryId: null,
        heroId: null,
        archetypeLabel: null,
      });
      expect(state.mode).toBe("team_deck");
      expect(state.deckId).toBe("deck-1");
      expect(state.playerCategory).toBe("teammate");
    });

    it("defaults side A to a teammate team deck when absent", () => {
      const state = subjectStateFromSideA(undefined);
      expect(state.mode).toBe("team_deck");
      expect(state.playerCategory).toBe("teammate");
    });

    it("seeds side B into meta-deck mode", () => {
      const state = subjectStateFromSideB({
        playerCategory: "other",
        deckId: null,
        metaDeckEntryId: "entry-9",
        heroId: null,
        archetypeLabel: null,
      });
      expect(state.mode).toBe("meta_deck");
      expect(state.metaDeckEntryId).toBe("entry-9");
    });

    it("seeds side B into hero+label mode with the player category", () => {
      const state = subjectStateFromSideB({
        playerCategory: "circuit_player",
        deckId: null,
        metaDeckEntryId: null,
        heroId: "hero-1",
        archetypeLabel: "Draconic Dorinthea",
      });
      expect(state.mode).toBe("hero_label");
      expect(state.heroId).toBe("hero-1");
      expect(state.archetypeLabel).toBe("Draconic Dorinthea");
      expect(state.playerCategory).toBe("circuit_player");
    });

    it("defaults side B to hero+label (opponent) when absent", () => {
      const state = subjectStateFromSideB(undefined);
      expect(state.mode).toBe("hero_label");
      expect(state.playerCategory).toBe("other");
    });
  });
});
