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

import type { BadgeTone } from "@/components/ui/badge";

/** Name lookups (id → display name) used to render a log's references legibly. */
export interface GameLogLabelMaps {
  decks: Record<string, string>;
  heroes: Record<string, string>;
  /** Meta deck entry id → its resolved `hero · label` display name. */
  metaEntries: Record<string, string>;
}

/** Render a meta deck entry reference as its `hero · label (Meta Deck)` display. */
function describeMetaEntry(entryId: string, maps: GameLogLabelMaps): string {
  return `${maps.metaEntries[entryId] ?? "Meta deck"} (Meta Deck)`;
}

/** A human description of our side, from whichever matchup subject it carries. */
export function describeSelf(sideA: GameLogSummary["sideA"], maps: GameLogLabelMaps): string {
  if (sideA.deckId) return maps.decks[sideA.deckId] ?? "Our deck";
  if (sideA.metaDeckEntryId) return describeMetaEntry(sideA.metaDeckEntryId, maps);
  if (sideA.heroId) {
    const hero = maps.heroes[sideA.heroId] ?? "Hero";
    return sideA.archetypeLabel ? `${hero} — ${sideA.archetypeLabel}` : hero;
  }
  return "Our side";
}

/** A human description of the opponent side, from whichever matchup subject it carries. */
export function describeOpponent(sideB: GameLogSummary["sideB"], maps: GameLogLabelMaps): string {
  if (sideB.deckId) return maps.decks[sideB.deckId] ?? "Team deck";
  if (sideB.metaDeckEntryId) return describeMetaEntry(sideB.metaDeckEntryId, maps);
  if (sideB.heroId) {
    const hero = maps.heroes[sideB.heroId] ?? "Unknown hero";
    return sideB.archetypeLabel ? `${hero} — ${sideB.archetypeLabel}` : hero;
  }
  return "Unknown opponent";
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

/** Badge tone for a result from our side's perspective: a win is success, a loss
 *  is danger, an even split is neutral. Works for both best-of-1 and match scores. */
export function gameResultTone(result: GameResult): BadgeTone {
  if (result.gamesWonA > result.gamesWonB) return "success";
  if (result.gamesWonA < result.gamesWonB) return "danger";
  return "neutral";
}

/** Format a played-at instant as a local date. */
export function formatPlayedAt(iso: string): string {
  return new Date(iso).toLocaleDateString();
}
