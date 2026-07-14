import type { GameLogDetail } from "@teambrewer/shared";

/**
 * How the opponent is identified. Drives which opponent sub-control is shown. The
 * opponent is a matchup subject: an `archetype` (a free-text label with an optional
 * hero qualifier), a `team_deck`, or a `teammate` (a pilot on a team deck).
 */
export type OpponentKind = "archetype" | "teammate" | "team_deck";

export const OPPONENT_KIND_LABELS: Record<OpponentKind, string> = {
  archetype: "Archetype",
  teammate: "Teammate",
  team_deck: "Team deck",
};

/** The opponent-related slice of wizard state, derived from an existing log in edit mode. */
export interface OpponentState {
  kind: OpponentKind;
  heroId: string;
  pilotUserId: string;
  teamDeckId: string;
  opponentDeckId: string;
  archetypeLabel: string;
  externalOpponentName: string;
}

/** Derive the initial opponent kind + fields from an existing log (edit mode). */
export function opponentStateFromLog(gameLog: GameLogDetail | undefined): OpponentState {
  const sideB = gameLog?.sideB;
  const base = {
    heroId: "",
    pilotUserId: "",
    teamDeckId: "",
    opponentDeckId: "",
    archetypeLabel: "",
    externalOpponentName: sideB?.externalOpponentName ?? "",
  };
  if (!sideB) return { kind: "archetype", ...base };
  if (sideB.pilotUserId) {
    return {
      kind: "teammate",
      ...base,
      pilotUserId: sideB.pilotUserId,
      teamDeckId: sideB.deckId ?? "",
    };
  }
  if (sideB.deckId) return { kind: "team_deck", ...base, opponentDeckId: sideB.deckId };
  // Hero + label (and, as a fallback, any meta-entry opponent the wizard can't yet
  // pick) surface as the archetype subject.
  return {
    kind: "archetype",
    ...base,
    heroId: sideB.heroId ?? "",
    archetypeLabel: sideB.archetypeLabel ?? "",
  };
}
