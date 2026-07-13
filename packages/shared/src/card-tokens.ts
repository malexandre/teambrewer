/**
 * Shared `+card` inline-token helpers (see docs/features/tasks.md,
 * docs/decisions/0010-meta-as-organizing-hub.md). Card links are embedded in any
 * prose body — task descriptions, matchup game-plan bodies, deck notes — as a
 * stable token `+[[cardId]]`, mirroring the `@member` mention composer. Card
 * names contain spaces, so free-text matching is unsafe; the token carries the
 * card's id. These helpers are pure (no DB), so the same parse/format runs in the
 * composer, the API validator, and the renderer.
 *
 * `@member` mentions are unaffected — they stay as-is (see
 * `parseMentionHandles` in collaboration.ts).
 */

/**
 * Matches a card token `+[[cardId]]`. The id charset is the cuid/id alphabet
 * (letters, digits, `_`, `-`); a lone `+` or `+[[` without a well-formed id and
 * closing `]]` is not a token, so ordinary prose containing `+` is left intact.
 */
const CARD_TOKEN_PATTERN = /\+\[\[([A-Za-z0-9_-]+)\]\]/g;

/** Format a card id as its inline token, e.g. `formatCardToken("abc") === "+[[abc]]"`. */
export function formatCardToken(cardId: string): string {
  return `+[[${cardId}]]`;
}

/**
 * Extract the distinct card ids referenced by `+[[cardId]]` tokens in a body, in
 * first-seen order (deduped). A `+` not followed by a well-formed token is ignored.
 */
export function parseCardTokens(body: string): string[] {
  const cardIds: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(CARD_TOKEN_PATTERN)) {
    const cardId = match[1];
    if (cardId && !seen.has(cardId)) {
      seen.add(cardId);
      cardIds.push(cardId);
    }
  }
  return cardIds;
}

/** A run of plain prose between (or around) card tokens. */
export interface CardBodyTextSegment {
  type: "text";
  text: string;
}

/** A resolved card reference, to be rendered as a card chip. */
export interface CardBodyCardSegment {
  type: "card";
  cardId: string;
}

/** One piece of a tokenized body: either plain text or a card reference. */
export type CardBodySegment = CardBodyTextSegment | CardBodyCardSegment;

/**
 * Split a body into an ordered list of text and card-token segments for
 * rendering (the renderer maps `card` segments to card chips and `text`
 * segments to escaped prose). Adjacent text is coalesced; empty text segments
 * are omitted, so `"+[[a]]+[[b]]"` yields two card segments with no empty text
 * between them. Concatenating every `text` segment and each token's
 * `formatCardToken(cardId)` reproduces the original body.
 */
export function tokenizeCardBody(body: string): CardBodySegment[] {
  const segments: CardBodySegment[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(CARD_TOKEN_PATTERN)) {
    const cardId = match[1];
    if (cardId === undefined) {
      continue;
    }
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      segments.push({ type: "text", text: body.slice(lastIndex, matchIndex) });
    }
    segments.push({ type: "card", cardId });
    lastIndex = matchIndex + match[0].length;
  }
  if (lastIndex < body.length) {
    segments.push({ type: "text", text: body.slice(lastIndex) });
  }
  return segments;
}
