import { describe, expect, it } from "vitest";

import {
  type DeckAttributionIdentity,
  deckOwnedGameSides,
  gameSideBelongsToDeck,
  type GameSideSubjectIdentity,
} from "./deck-attribution.js";
import { deriveMatchupSubjectRef } from "./game-plans.js";

/** A side that is a specific team deck. */
function deckSide(deckId: string): GameSideSubjectIdentity {
  return { deckId, metaDeckEntryId: null, heroId: null, archetypeLabel: null };
}
/** A side that is a specific meta deck entry. */
function entrySide(metaDeckEntryId: string): GameSideSubjectIdentity {
  return { deckId: null, metaDeckEntryId, heroId: null, archetypeLabel: null };
}
/** A bare hero (+ optional label) side. */
function heroSide(heroId: string | null, archetypeLabel: string | null): GameSideSubjectIdentity {
  return { deckId: null, metaDeckEntryId: null, heroId, archetypeLabel };
}

const KATSU_REF = deriveMatchupSubjectRef({ heroId: "hero-katsu", label: "Aggro Katsu" });
const FATIGUE_REF = deriveMatchupSubjectRef({ heroId: null, label: "Fatigue Prism" });

/** "Our Katsu": piloted directly, linked to the Katsu entry, a sibling build exists. */
const deck: DeckAttributionIdentity = {
  deckId: "deck-mine",
  linkedMetaDeckEntryIds: new Set(["entry-katsu", "entry-fatigue"]),
  siblingDeckIds: new Set(["deck-sibling"]),
  linkedEntrySubjectRefs: new Set([KATSU_REF, FATIGUE_REF]),
};

describe("gameSideBelongsToDeck", () => {
  it("T1 — matches the deck piloted directly", () => {
    expect(gameSideBelongsToDeck(deckSide("deck-mine"), deck)).toBe(true);
  });

  it("T2 — matches a meta deck entry the deck is linked to", () => {
    expect(gameSideBelongsToDeck(entrySide("entry-katsu"), deck)).toBe(true);
    expect(gameSideBelongsToDeck(entrySide("entry-fatigue"), deck)).toBe(true);
  });

  it("T2 — does not match an entry the deck is not linked to", () => {
    expect(gameSideBelongsToDeck(entrySide("entry-other"), deck)).toBe(false);
  });

  it("T3 — matches a sibling team deck linked to the same entry", () => {
    expect(gameSideBelongsToDeck(deckSide("deck-sibling"), deck)).toBe(true);
  });

  it("T3 — does not match an unrelated team deck", () => {
    expect(gameSideBelongsToDeck(deckSide("deck-unrelated"), deck)).toBe(false);
  });

  it("T4 — matches a bare hero+label that ref-matches a linked entry", () => {
    expect(gameSideBelongsToDeck(heroSide("hero-katsu", "Aggro Katsu"), deck)).toBe(true);
  });

  it("T4 — case-insensitive on the label (mirrors deriveMatchupSubjectRef)", () => {
    expect(gameSideBelongsToDeck(heroSide("hero-katsu", "  aggro katsu  "), deck)).toBe(true);
  });

  it("T4 — same hero under a different label does not match", () => {
    expect(gameSideBelongsToDeck(heroSide("hero-katsu", "Control Katsu"), deck)).toBe(false);
  });

  it("T4 — matches a backfilled label-only side against a label-only entry", () => {
    expect(gameSideBelongsToDeck(heroSide(null, "Fatigue Prism"), deck)).toBe(true);
  });

  it("T4 — a hero-bearing side never ref-matches a label-only entry", () => {
    expect(gameSideBelongsToDeck(heroSide("hero-prism", "Fatigue Prism"), deck)).toBe(false);
  });

  it("T4 — is gated to sides with no deck/entry id (an unrelated deck side never falls through)", () => {
    // A deck side whose id matches nothing must not be rescued by a hero ref, even if
    // one were present — the tier is gated on deckId === null && metaDeckEntryId === null.
    const unrelatedWithHero: GameSideSubjectIdentity = {
      deckId: "deck-unrelated",
      metaDeckEntryId: null,
      heroId: "hero-katsu",
      archetypeLabel: "Aggro Katsu",
    };
    expect(gameSideBelongsToDeck(unrelatedWithHero, deck)).toBe(false);
  });

  it("empty attribution sets — only the deck's own id matches", () => {
    const lonely: DeckAttributionIdentity = {
      deckId: "deck-mine",
      linkedMetaDeckEntryIds: new Set(),
      siblingDeckIds: new Set(),
      linkedEntrySubjectRefs: new Set(),
    };
    expect(gameSideBelongsToDeck(deckSide("deck-mine"), lonely)).toBe(true);
    expect(gameSideBelongsToDeck(entrySide("entry-katsu"), lonely)).toBe(false);
    expect(gameSideBelongsToDeck(heroSide("hero-katsu", "Aggro Katsu"), lonely)).toBe(false);
  });
});

describe("deckOwnedGameSides", () => {
  it("attributes side A when the deck is on A", () => {
    expect(
      deckOwnedGameSides({ sideA: deckSide("deck-mine"), sideB: heroSide("h", "x") }, deck),
    ).toEqual(["A"]);
  });

  it("attributes side B when the deck (as a meta entry) is on B", () => {
    expect(
      deckOwnedGameSides({ sideA: heroSide("h", "x"), sideB: entrySide("entry-katsu") }, deck),
    ).toEqual(["B"]);
  });

  it("attributes neither side when the game is unrelated", () => {
    expect(
      deckOwnedGameSides({ sideA: deckSide("deck-x"), sideB: heroSide("hero-y", "Y") }, deck),
    ).toEqual([]);
  });

  it("attributes both sides in a linked mirror (deck vs its own linked entry)", () => {
    expect(
      deckOwnedGameSides({ sideA: deckSide("deck-mine"), sideB: entrySide("entry-katsu") }, deck),
    ).toEqual(["A", "B"]);
  });
});
