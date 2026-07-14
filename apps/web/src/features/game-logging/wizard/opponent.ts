import type { GameLogDetail } from "@teambrewer/shared";

/** How the opponent is identified. Drives which opponent sub-control is shown. */
export type OpponentKind = "hero" | "teammate" | "archetype" | "team_deck";

export const OPPONENT_KIND_LABELS: Record<OpponentKind, string> = {
  hero: "Opponent hero",
  teammate: "Teammate",
  archetype: "Archetype label",
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
  if (!sideB) return { kind: "hero", ...base };
  if (sideB.pilotUserId) {
    return {
      kind: "teammate",
      ...base,
      pilotUserId: sideB.pilotUserId,
      teamDeckId: sideB.deckId ?? "",
    };
  }
  if (sideB.deckId) return { kind: "team_deck", ...base, opponentDeckId: sideB.deckId };
  if (sideB.heroId) return { kind: "hero", ...base, heroId: sideB.heroId };
  if (sideB.archetypeLabel)
    return { kind: "archetype", ...base, archetypeLabel: sideB.archetypeLabel };
  return { kind: "hero", ...base };
}
