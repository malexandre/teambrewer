import { deriveMatchupSubjectRef } from "./game-plans.js";
import type { GameSide } from "./game-log.js";

/**
 * Deck card-observation attribution (see docs/features/decks.md). Given a game's two
 * sides and a deck's identity, decide which side(s) the deck "owns" — i.e. whose
 * captured impressive/underperforming cards should roll up onto that deck. This is the
 * symmetric generalization of the readiness matcher (`gameMatchesEntry`), which only
 * inspects the opponent side and answers a win/loss question; here we answer "which
 * side is this deck?" for **both** sides, so a deck logged as A or B, or represented by
 * a meta deck entry on either side, all feed its card counts. Pure and game-agnostic.
 */

/**
 * One game side's resolved matchup-subject identity — the neutral columns a game log
 * stores per side (exactly one of `deckId` / `metaDeckEntryId` / `heroId` is set; a
 * bare hero side may also carry an `archetypeLabel`).
 */
export interface GameSideSubjectIdentity {
  deckId: string | null;
  metaDeckEntryId: string | null;
  heroId: string | null;
  archetypeLabel: string | null;
}

/**
 * A deck's identity for broadest card attribution: its own id plus the closure of the
 * meta deck entries it is linked to (`DeckMeta.metaDeckEntryId`) — the linked entry ids
 * themselves, the sibling team decks also linked to those entries (self excluded), and
 * the subject refs (`deriveMatchupSubjectRef`) of those entries for the hero+label
 * fallback.
 */
export interface DeckAttributionIdentity {
  deckId: string;
  linkedMetaDeckEntryIds: ReadonlySet<string>;
  siblingDeckIds: ReadonlySet<string>;
  linkedEntrySubjectRefs: ReadonlySet<string>;
}

/**
 * Whether a single game side is "owned" by the deck, under the four broadest-attribution
 * tiers (checked in order):
 *
 * 1. **Piloted** — the side is the deck itself (`deckId`).
 * 2. **Linked entry** — the side is a meta deck entry the deck is linked to.
 * 3. **Sibling deck** — the side is another team deck linked to one of those entries.
 * 4. **Hero+label** — a bare hero side (no deck/entry id) whose subject ref matches a
 *    linked entry's subject (catches un-linked and backfilled games), mirroring the
 *    readiness fallback. Gated to sides with neither a deck nor an entry id.
 */
export function gameSideBelongsToDeck(
  side: GameSideSubjectIdentity,
  deck: DeckAttributionIdentity,
): boolean {
  if (side.deckId !== null && side.deckId === deck.deckId) {
    return true;
  }
  if (side.metaDeckEntryId !== null && deck.linkedMetaDeckEntryIds.has(side.metaDeckEntryId)) {
    return true;
  }
  if (side.deckId !== null && deck.siblingDeckIds.has(side.deckId)) {
    return true;
  }
  if (side.deckId === null && side.metaDeckEntryId === null) {
    const ref = deriveMatchupSubjectRef({ heroId: side.heroId, label: side.archetypeLabel });
    if (deck.linkedEntrySubjectRefs.has(ref)) {
      return true;
    }
  }
  return false;
}

/**
 * The A/B sides a game attributes to the deck: `[]`, `["A"]`, `["B"]`, or both. Both
 * sides can own in a linked mirror (the deck vs its own linked entry / a sibling), in
 * which case the deck's cards on both sides count.
 */
export function deckOwnedGameSides(
  game: { sideA: GameSideSubjectIdentity; sideB: GameSideSubjectIdentity },
  deck: DeckAttributionIdentity,
): GameSide[] {
  const owned: GameSide[] = [];
  if (gameSideBelongsToDeck(game.sideA, deck)) {
    owned.push("A");
  }
  if (gameSideBelongsToDeck(game.sideB, deck)) {
    owned.push("B");
  }
  return owned;
}
