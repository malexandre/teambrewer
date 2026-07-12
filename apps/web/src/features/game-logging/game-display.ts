import type {
  DeckMaturity,
  GameLogCardSide,
  GameLogSummary,
  GameResult,
  LossReason,
  PilotFamiliarity,
  Seriousness,
  SkillParity,
  WinType,
} from "@teambrewer/shared";

/** Name lookups (id → display name) used to render a log's references legibly. */
export interface GameLogLabelMaps {
  decks: Record<string, string>;
  heroes: Record<string, string>;
  members: Record<string, string>;
}

/** A human description of the opponent side, from whichever identifier it carries. */
export function describeOpponent(sideB: GameLogSummary["sideB"], maps: GameLogLabelMaps): string {
  if (sideB.pilotUserId) {
    const pilot = maps.members[sideB.pilotUserId] ?? "A teammate";
    const deck = sideB.deckId ? maps.decks[sideB.deckId] : undefined;
    return deck ? `${pilot} (${deck})` : pilot;
  }
  const name = sideB.externalOpponentName ? `${sideB.externalOpponentName} — ` : "";
  if (sideB.deckId) return `${name}${maps.decks[sideB.deckId] ?? "Reference deck"}`;
  if (sideB.heroId) return `${name}${maps.heroes[sideB.heroId] ?? "Unknown hero"}`;
  if (sideB.archetypeLabel) return `${name}${sideB.archetypeLabel}`;
  return sideB.externalOpponentName ?? "Unknown opponent";
}

/** Native-select styling shared by the game-logging pickers (matches decks/events). */
export const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-2 text-sm";

/**
 * The four confidence factors as segmented controls, each option ordered
 * best → worst so the pre-filled default (the first, most-trusted option) sits
 * first. The single source of truth the form maps over; labels read in plain
 * language so a member sees *why* a result is or isn't trusted.
 */
export interface ConfidenceFactorField<Value extends string> {
  key: "skillParity" | "seriousness" | "deckMaturity" | "pilotFamiliarity";
  label: string;
  options: { value: Value; label: string }[];
}

export const SKILL_PARITY_FIELD: ConfidenceFactorField<SkillParity> = {
  key: "skillParity",
  label: "Skill parity",
  options: [
    { value: "evenly_matched", label: "Evenly matched" },
    { value: "minor_gap", label: "Minor gap" },
    { value: "major_gap", label: "Major gap" },
  ],
};

export const SERIOUSNESS_FIELD: ConfidenceFactorField<Seriousness> = {
  key: "seriousness",
  label: "Seriousness",
  options: [
    { value: "tournament_serious", label: "Tournament-serious" },
    { value: "focused_practice", label: "Focused practice" },
    { value: "casual", label: "Casual" },
  ],
};

export const DECK_MATURITY_FIELD: ConfidenceFactorField<DeckMaturity> = {
  key: "deckMaturity",
  label: "Deck maturity",
  options: [
    { value: "both_tuned", label: "Both tuned" },
    { value: "partially_tuned", label: "Partially tuned" },
    { value: "experimental", label: "Experimental" },
  ],
};

export const PILOT_FAMILIARITY_FIELD: ConfidenceFactorField<PilotFamiliarity> = {
  key: "pilotFamiliarity",
  label: "Pilot familiarity",
  options: [
    { value: "knows_well", label: "Knows it well" },
    { value: "learning", label: "Learning" },
    { value: "first_time", label: "First time" },
  ],
};

/** Human labels for the optional win-type tag. */
export const WIN_TYPE_LABELS: Record<WinType, string> = {
  life_to_zero: "Life to zero",
  on_time: "Won on time",
  opponent_concede: "Opponent conceded",
  deck_out: "Decked out opponent",
};

/** Human labels for the optional loss-reason tag. */
export const LOSS_REASON_LABELS: Record<LossReason, string> = {
  outplayed: "Outplayed",
  misplay: "Misplay",
  on_time: "Lost on time",
  mismatch: "Bad matchup",
  variance: "Variance",
  deck_out: "Decked out",
};

/** Human labels for whose card a captured card was. */
export const GAME_LOG_CARD_SIDE_LABELS: Record<GameLogCardSide, string> = {
  ours: "Our card",
  theirs: "Their card",
};

/** The derived-weight hint, e.g. "counts as ~0.78". */
export function formatConfidenceWeight(weight: number): string {
  return weight.toFixed(2);
}

/** A compact result string, e.g. "2–1" for a match or "Win"/"Loss"/"Draw" for a single game. */
export function formatResult(bestOf: number, result: GameResult): string {
  if (bestOf === 1) {
    if (result.gamesWonA > result.gamesWonB) return "Win";
    if (result.gamesWonA < result.gamesWonB) return "Loss";
    return "Draw";
  }
  return `${result.gamesWonA}–${result.gamesWonB}`;
}

/** Format a played-at instant as a local date. */
export function formatPlayedAt(iso: string): string {
  return new Date(iso).toLocaleDateString();
}
