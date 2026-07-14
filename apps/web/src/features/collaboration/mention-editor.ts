import { formatCardToken } from "@teambrewer/shared";

/**
 * Pure DOM helpers backing the {@link MentionComposer}'s `contenteditable`
 * editor. The editor's DOM is the source of truth (React does not re-render its
 * contents on each keystroke), so these functions translate between that DOM
 * and the stored body string, and detect the in-progress `@`/`+` trigger from
 * the text before the caret. They hold no React or browser-event state, which
 * keeps them unit-testable without a live Selection/Range.
 */

/**
 * DOM attribute that marks a node as a `+card` pill; its value is the card id.
 * A pill is an atomic, non-editable inline element showing the card's name,
 * serialized back to a `+[[cardId]]` token.
 */
export const CARD_PILL_ATTRIBUTE = "data-card-id";

/** The caret position of a trigger: `token` is the text typed after the trigger char. */
export interface TriggerMatch {
  token: string;
  /** Index (within the caret's text node) of the token's first character. */
  start: number;
}

/**
 * The in-progress `@member` token ending at the caret, or null. Mirrors the
 * identifier charset used server-side for `@username` mention parsing; a run
 * preceded by another identifier char (mid-word `@`) is not a trigger.
 */
export function activeMentionToken(textBeforeCaret: string): TriggerMatch | null {
  const match = /(?:^|[^A-Za-z0-9._-])@([A-Za-z0-9._-]*)$/.exec(textBeforeCaret);
  if (!match) {
    return null;
  }
  const token = match[1] ?? "";
  return { token, start: textBeforeCaret.length - token.length };
}

/**
 * The in-progress `+card` token ending at the caret, or null. The query allows
 * spaces (card names have them) but excludes `+`, `[`, and `]`, so it never
 * spills across a completed pill or into a second `+`.
 */
export function activeCardToken(textBeforeCaret: string): TriggerMatch | null {
  const match = /(?:^|\s)\+([^+\n[\]]*)$/.exec(textBeforeCaret);
  if (!match) {
    return null;
  }
  const token = match[1] ?? "";
  return { token, start: textBeforeCaret.length - token.length };
}

/** Build a `+card` pill element (atomic, non-editable) for the given card. */
export function createCardPill(doc: Document, cardId: string, cardName: string): HTMLSpanElement {
  const pill = doc.createElement("span");
  pill.setAttribute(CARD_PILL_ATTRIBUTE, cardId);
  // Atomic: the caret cannot land inside it, and backspace deletes it whole.
  pill.setAttribute("contenteditable", "false");
  pill.className = "mx-0.5 rounded bg-primary/10 px-1 align-baseline font-medium text-primary";
  setCardPillName(pill, cardName);
  return pill;
}

/**
 * Set (or refresh) a pill's visible label. Names resolve asynchronously when an
 * existing body is loaded for editing, so the pill is created with a placeholder
 * and relabelled in place once its card summary arrives — without disturbing the
 * surrounding text nodes or the caret.
 */
export function setCardPillName(pill: Element, cardName: string): void {
  pill.textContent = `+${cardName}`;
}

/**
 * Serialize the editor's DOM subtree back to the stored body string: text nodes
 * verbatim, `+card` pills to their `+[[cardId]]` token, `<br>` to a newline, and
 * any block wrappers the browser injects on Enter onto their own line. This is
 * the inverse of building the DOM from a body via `tokenizeCardBody`.
 */
export function serializeEditorRoot(root: Node): string {
  let out = "";
  root.childNodes.forEach((child) => {
    out += serializeNode(child, out);
  });
  return out;
}

function serializeNode(node: Node, precedingOutput: string): string {
  if (node.nodeType === node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType !== node.ELEMENT_NODE) {
    return "";
  }
  const element = node as Element;
  if (element.tagName === "BR") {
    return "\n";
  }
  const cardId = element.getAttribute(CARD_PILL_ATTRIBUTE);
  if (cardId !== null) {
    return formatCardToken(cardId);
  }
  // A block wrapper (DIV/P a browser may insert on Enter) starts a new line when
  // it isn't the first content and the output doesn't already end with one.
  const isBlock = element.tagName === "DIV" || element.tagName === "P";
  let out = isBlock && precedingOutput.length > 0 && !precedingOutput.endsWith("\n") ? "\n" : "";
  element.childNodes.forEach((child) => {
    out += serializeNode(child, precedingOutput + out);
  });
  return out;
}
