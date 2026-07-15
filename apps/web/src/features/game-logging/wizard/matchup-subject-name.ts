import {
  type DeckSummary,
  type Hero,
  matchupSubjectDisplayName,
  type MetaDeckEntry,
} from "@teambrewer/shared";

import type { MatchupSubjectState } from "./matchup-subject";

/** The reference data needed to turn a subject's ids into a human name. */
export interface MatchupSubjectNameData {
  decks: DeckSummary[];
  heroes: Hero[];
  metaEntries: MetaDeckEntry[];
}

/**
 * Resolve a matchup subject to a concise, human-readable name — the hero name
 * (leading, per {@link matchupSubjectDisplayName}) whenever one is known, so the
 * result step can label each side by who it actually is rather than by "Deck A" /
 * "Deck B". A team deck resolves to its hero (falling back to the deck name); a meta
 * deck entry and a free hero+label resolve through the shared hero-first display
 * rule. Falls back to the caller's placeholder while the subject is still incomplete.
 */
export function resolveMatchupSubjectName(
  state: MatchupSubjectState,
  data: MatchupSubjectNameData,
  fallback: string,
): string {
  const heroName = (heroId: string | null | undefined): string | undefined =>
    heroId ? data.heroes.find((hero) => hero.id === heroId)?.name : undefined;

  if (state.mode === "team_deck") {
    const deck = data.decks.find((candidate) => candidate.id === state.deckId);
    if (!deck) return fallback;
    return heroName(deck.heroId) ?? deck.name;
  }

  if (state.mode === "meta_deck") {
    const entry = data.metaEntries.find((candidate) => candidate.id === state.metaDeckEntryId);
    if (!entry) return fallback;
    return (
      matchupSubjectDisplayName(heroName(entry.heroId), entry.label) || entry.opponentSnapshotLabel
    );
  }

  // hero_label: the hero is required for a complete subject; the label is optional.
  return matchupSubjectDisplayName(heroName(state.heroId), state.archetypeLabel) || fallback;
}
