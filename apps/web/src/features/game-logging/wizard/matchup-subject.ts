import type { GameLogDetail, GameSideA, GameSideB, PlayerCategory } from "@teambrewer/shared";

/**
 * How one game-log side's matchup subject is being identified. Both sides are
 * **matchup subjects** (R-1 data model): exactly one of a team deck, a meta deck
 * entry, or a free-text hero + archetype label. The same three modes drive the
 * self side and the opponent side, so a single picker serves both.
 */
export type MatchupSubjectMode = "team_deck" | "meta_deck" | "hero_label";

/** The subject modes in the order the picker offers them (team deck first). */
export const MATCHUP_SUBJECT_MODES: readonly MatchupSubjectMode[] = [
  "team_deck",
  "meta_deck",
  "hero_label",
] as const;

/** Human labels for the subject modes (single place so the picker reads consistently). */
export const MATCHUP_SUBJECT_MODE_LABELS: Record<MatchupSubjectMode, string> = {
  team_deck: "Team deck",
  meta_deck: "Meta deck",
  hero_label: "Hero + label",
};

/**
 * The full editable state for one side of the matchup: the chosen subject mode,
 * the per-mode fields, and the `playerCategory` classifying who piloted the side
 * (teammate / circuit player / other), which is independent of the subject.
 */
export interface MatchupSubjectState {
  mode: MatchupSubjectMode;
  /** team_deck mode: the selected team deck id. */
  deckId: string;
  /** meta_deck mode: the selected meta deck entry id. */
  metaDeckEntryId: string;
  /** hero_label mode: the optional hero qualifier. */
  heroId: string;
  /** hero_label mode: the required free-text archetype label. */
  archetypeLabel: string;
  /** Who piloted this side, categorically; independent of the subject. */
  playerCategory: PlayerCategory;
}

/** An empty subject state in the given mode (every subject field blank). */
export function emptyMatchupSubjectState(
  mode: MatchupSubjectMode,
  playerCategory: PlayerCategory = "other",
): MatchupSubjectState {
  return {
    mode,
    deckId: "",
    metaDeckEntryId: "",
    heroId: "",
    archetypeLabel: "",
    playerCategory,
  };
}

/** Infer the subject mode a stored side is expressed in (team deck / meta deck / hero + label). */
function modeFromSide(side: {
  deckId?: string | null;
  metaDeckEntryId?: string | null;
}): MatchupSubjectMode {
  if (side.deckId) return "team_deck";
  if (side.metaDeckEntryId) return "meta_deck";
  return "hero_label";
}

/**
 * Seed the self-side picker state from an existing log's `sideA` (edit mode). When
 * there is no stored side (create mode) it defaults to a team deck piloted by a
 * teammate — the common case for our own side.
 */
export function subjectStateFromSideA(
  sideA: GameLogDetail["sideA"] | undefined,
): MatchupSubjectState {
  if (!sideA) {
    return emptyMatchupSubjectState("team_deck", "teammate");
  }
  return {
    mode: modeFromSide(sideA),
    deckId: sideA.deckId ?? "",
    metaDeckEntryId: sideA.metaDeckEntryId ?? "",
    heroId: sideA.heroId ?? "",
    archetypeLabel: sideA.archetypeLabel ?? "",
    playerCategory: sideA.playerCategory,
  };
}

/**
 * Seed the opponent-side picker state from an existing log's `sideB` (edit mode).
 * When there is no stored side (create mode) it defaults to hero + label, the mode
 * that always works even without a current meta or matching team deck.
 */
export function subjectStateFromSideB(
  sideB: GameLogDetail["sideB"] | undefined,
): MatchupSubjectState {
  if (!sideB) {
    return emptyMatchupSubjectState("hero_label", "other");
  }
  return {
    mode: modeFromSide(sideB),
    deckId: sideB.deckId ?? "",
    metaDeckEntryId: sideB.metaDeckEntryId ?? "",
    heroId: sideB.heroId ?? "",
    archetypeLabel: sideB.archetypeLabel ?? "",
    playerCategory: sideB.playerCategory,
  };
}

/** The three mutually-exclusive subject forms (plus the optional hero qualifier). */
interface MatchupSubjectFields {
  deckId?: string;
  metaDeckEntryId?: string;
  heroId?: string;
  archetypeLabel?: string;
}

/**
 * The subject fields for the current mode, or `null` when the mode is not yet
 * validly filled (no deck / no meta entry / no hero). Exactly one subject form is
 * emitted, matching the shared schema's exactly-one-subject rule. In the free
 * "Other" (hero + label) mode the hero is required and the label is an optional
 * qualifier — mirroring a meta deck entry, but with the hero mandatory.
 */
function buildSubjectFields(state: MatchupSubjectState): MatchupSubjectFields | null {
  if (state.mode === "team_deck") {
    return state.deckId ? { deckId: state.deckId } : null;
  }
  if (state.mode === "meta_deck") {
    return state.metaDeckEntryId ? { metaDeckEntryId: state.metaDeckEntryId } : null;
  }
  if (!state.heroId) return null;
  const label = state.archetypeLabel.trim();
  return { heroId: state.heroId, ...(label ? { archetypeLabel: label } : {}) };
}

/** Whether the side's subject is validly filled (gates advancing past the matchup step). */
export function isSubjectComplete(state: MatchupSubjectState): boolean {
  return buildSubjectFields(state) !== null;
}

/**
 * Build the self side (`sideA`) payload from the picker state, or `null` when the
 * subject is incomplete. The player category is attached independently of the subject.
 */
export function buildSideAInput(state: MatchupSubjectState): GameSideA | null {
  const fields = buildSubjectFields(state);
  if (!fields) return null;
  return { ...fields, playerCategory: state.playerCategory };
}

/**
 * Build the opponent side (`sideB`) payload from the picker state, or `null` when
 * the subject is incomplete. The player category is attached independently of the subject.
 */
export function buildSideBInput(state: MatchupSubjectState): GameSideB | null {
  const fields = buildSubjectFields(state);
  if (!fields) return null;
  return { ...fields, playerCategory: state.playerCategory };
}
