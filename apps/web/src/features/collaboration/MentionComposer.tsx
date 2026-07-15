import { parseCardTokens, tokenizeCardBody } from "@teambrewer/shared";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { CardResultRow } from "@/features/cards/CardResultRow";
import { useCardSearch } from "@/features/cards/use-card-search";
import { useCardsById } from "@/features/cards/use-cards-by-id";
import { useDebouncedValue } from "@/features/cards/use-debounced-value";
import { useMembers } from "@/features/teams/use-members";

import {
  activeCardToken,
  activeMentionToken,
  CARD_PILL_ATTRIBUTE,
  createCardPill,
  serializeEditorRoot,
  setCardPillName,
  type TriggerMatch,
} from "./mention-editor";

/** The active trigger immediately before the caret (drives the suggestion list). */
type ActiveTrigger = ({ kind: "member" } | { kind: "card" }) & TriggerMatch;

function detectActiveTrigger(
  textBeforeCaret: string,
  enableMemberMentions: boolean,
  enableCardMentions: boolean,
): ActiveTrigger | null {
  if (enableCardMentions) {
    const card = activeCardToken(textBeforeCaret);
    if (card) {
      return { kind: "card", ...card };
    }
  }
  if (enableMemberMentions) {
    const member = activeMentionToken(textBeforeCaret);
    if (member) {
      return { kind: "member", ...member };
    }
  }
  return null;
}

/** The collapsed caret's text node and offset, if it sits inside `root`. */
function caretInEditor(root: HTMLElement): { node: Text; offset: number } | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return null;
  }
  const { anchorNode, anchorOffset } = selection;
  if (!anchorNode || !root.contains(anchorNode) || anchorNode.nodeType !== anchorNode.TEXT_NODE) {
    return null;
  }
  return { node: anchorNode as Text, offset: anchorOffset };
}

function placeCaret(node: Node, offset: number): void {
  const selection = node.ownerDocument?.getSelection();
  if (!selection) {
    return;
  }
  const range = node.ownerDocument!.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * A prose composer with inline autocomplete. `@`-mentions autocomplete over the
 * active team's members (fetched via {@link useMembers}, X-Team-Id scoped) and
 * insert a bare `@username`. `+`-mentions autocomplete cards via {@link
 * useCardSearch} and insert them as atomic **pills** showing `+CardName`, backed
 * by the stable `+[[cardId]]` token (card names have spaces and aren't unique, so
 * the token carries the id — see `card-tokens` in `@teambrewer/shared`).
 *
 * The editor is a `contenteditable="plaintext-only"` region whose DOM is the
 * source of truth: React sets its content up once (from `initialValue`) and
 * never re-renders it, so keystrokes and the caret are the browser's to manage.
 * On submit the DOM is serialized back to the body string (pills → tokens), so
 * everything downstream (validation, storage, rendering) is unchanged.
 *
 * Consumers pick the triggers: comments enable members only (the default), while
 * `+card`-enabled prose fields (task descriptions, game-plan bodies, deck notes)
 * opt into cards; either can run alone or together.
 */
export function MentionComposer({
  teamId,
  initialValue = "",
  submitLabel,
  placeholder,
  ariaLabel,
  isPending,
  onSubmit,
  onCancel,
  enableMemberMentions = true,
  enableCardMentions = false,
}: {
  teamId: string | undefined;
  initialValue?: string;
  submitLabel: string;
  placeholder: string;
  ariaLabel: string;
  isPending: boolean;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
  /** Enable `@member` autocomplete (bare `@username` on select). Defaults to true. */
  enableMemberMentions?: boolean;
  /** Enable `+card` autocomplete (an atomic `+[[cardId]]` pill on select). Defaults to false. */
  enableCardMentions?: boolean;
}) {
  const { data: memberData } = useMembers(teamId);
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeTrigger, setActiveTrigger] = useState<ActiveTrigger | null>(null);
  const [isEmpty, setIsEmpty] = useState(initialValue.trim().length === 0);

  // Resolve the names of any cards referenced by the initial body so their pills
  // can be built (and relabelled once their summaries arrive) when editing.
  const initialCardIds = useMemo(() => parseCardTokens(initialValue), [initialValue]);
  const cardsById = useCardsById(teamId, enableCardMentions ? initialCardIds : []);

  // Build the editor's DOM once, from the initial body. Pills start with a
  // placeholder label and are relabelled by the effect below as names resolve.
  const hasInitializedEditor = useRef(false);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || hasInitializedEditor.current) {
      return;
    }
    hasInitializedEditor.current = true;
    for (const segment of tokenizeCardBody(initialValue)) {
      if (segment.type === "text") {
        editor.appendChild(document.createTextNode(segment.text));
      } else {
        const name = cardsById.get(segment.cardId)?.name ?? "…";
        editor.appendChild(createCardPill(document, segment.cardId, name));
      }
    }
    setIsEmpty(serializeEditorRoot(editor).trim().length === 0);
  }, [initialValue, cardsById]);

  // Relabel initial pills as their card summaries resolve (in place, so the
  // user's caret and any edits are untouched).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    editor.querySelectorAll(`[${CARD_PILL_ATTRIBUTE}]`).forEach((pill) => {
      const card = cardsById.get(pill.getAttribute(CARD_PILL_ATTRIBUTE) ?? "");
      if (card) {
        setCardPillName(pill, card.name);
      }
    });
  }, [cardsById]);

  const members = memberData?.data ?? [];
  const memberSuggestions =
    activeTrigger?.kind === "member"
      ? members.filter((member) => {
          const token = activeTrigger.token.toLowerCase();
          return (
            member.username.toLowerCase().includes(token) ||
            member.displayName.toLowerCase().includes(token)
          );
        })
      : [];

  const cardQuery = activeTrigger?.kind === "card" ? activeTrigger.token.trim() : "";
  const debouncedCardQuery = useDebouncedValue(cardQuery).trim();
  const { data: cardData, isFetching: isCardSearchFetching } = useCardSearch(
    teamId,
    { query: debouncedCardQuery },
    { enabled: enableCardMentions && debouncedCardQuery.length > 0 },
  );
  const hasActiveCardQuery = activeTrigger?.kind === "card" && debouncedCardQuery.length > 0;
  const cardSuggestions = hasActiveCardQuery ? (cardData?.data ?? []) : [];
  // A settled card search that matched nothing: surface a hint row (rather than an
  // empty void) so a non-obvious cause — e.g. an unsynced/empty card database — is
  // explained. Suppressed while the search is still in flight to avoid a flash.
  const showNoCardMatchesHint =
    hasActiveCardQuery && !isCardSearchFetching && cardSuggestions.length === 0;

  function refreshFromSelection(): void {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    setIsEmpty(serializeEditorRoot(editor).trim().length === 0);
    const caret = caretInEditor(editor);
    if (!caret) {
      setActiveTrigger(null);
      return;
    }
    const textBeforeCaret = (caret.node.textContent ?? "").slice(0, caret.offset);
    setActiveTrigger(
      detectActiveTrigger(textBeforeCaret, enableMemberMentions, enableCardMentions),
    );
  }

  function insertMemberMention(username: string): void {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const caret = caretInEditor(editor);
    if (!caret) {
      return;
    }
    const nodeText = caret.node.textContent ?? "";
    const match = activeMentionToken(nodeText.slice(0, caret.offset));
    if (!match) {
      return;
    }
    // Keep everything up to and including the `@`, replace the typed run with the
    // resolved `username ` (bare, as `@mention` parsing expects), keep the rest.
    const before = nodeText.slice(0, match.start);
    const after = nodeText.slice(caret.offset);
    caret.node.textContent = `${before}${username} ${after}`;
    placeCaret(caret.node, before.length + username.length + 1);
    setActiveTrigger(null);
    refreshFromSelection();
  }

  function insertCardMention(cardId: string, cardName: string): void {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const caret = caretInEditor(editor);
    const parent = caret?.node.parentNode;
    if (!caret || !parent) {
      return;
    }
    const nodeText = caret.node.textContent ?? "";
    const match = activeCardToken(nodeText.slice(0, caret.offset));
    if (!match) {
      return;
    }
    // Drop the typed `+query` (the `+` sits one char before the token start) and
    // splice a pill + trailing space in its place, keeping any text after the caret.
    const before = nodeText.slice(0, match.start - 1);
    const after = nodeText.slice(caret.offset);
    const anchor = caret.node.nextSibling;
    const pill = createCardPill(document, cardId, cardName);
    const space = document.createTextNode(" ");
    parent.insertBefore(pill, anchor);
    parent.insertBefore(space, anchor);
    if (after) {
      parent.insertBefore(document.createTextNode(after), anchor);
    }
    if (before) {
      caret.node.textContent = before;
    } else {
      parent.removeChild(caret.node);
    }
    placeCaret(space, 1);
    setActiveTrigger(null);
    refreshFromSelection();
    editor.focus();
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const trimmed = serializeEditorRoot(editor).trim();
    if (!trimmed) {
      return;
    }
    onSubmit(trimmed);
    editor.textContent = "";
    setIsEmpty(true);
    setActiveTrigger(null);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="relative">
        <div
          ref={editorRef}
          // plaintext-only keeps Enter/paste plain (Baseline since 2025) so the
          // only rich node is our own atomic `+card` pill; whitespace-pre-wrap
          // preserves the exact spaces/newlines the serializer reads back.
          contentEditable="plaintext-only"
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          tabIndex={0}
          className="min-h-16 w-full whitespace-pre-wrap break-words rounded-md border border-input bg-background p-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onInput={refreshFromSelection}
          onKeyUp={refreshFromSelection}
          onClick={refreshFromSelection}
          onBlur={() => setActiveTrigger(null)}
        />
        {isEmpty ? (
          <span className="pointer-events-none absolute left-2 top-2 text-sm text-muted-foreground">
            {placeholder}
          </span>
        ) : null}
        {activeTrigger?.kind === "member" && memberSuggestions.length > 0 ? (
          <ul
            className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-md border border-border bg-popover text-sm shadow"
            aria-label="Mention suggestions"
          >
            {memberSuggestions.map((member) => (
              <li key={member.userId}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-muted"
                  // Use onMouseDown so the editor's onBlur does not clear the
                  // suggestion before the click registers.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMemberMention(member.username);
                  }}
                >
                  <span className="font-medium">{member.displayName}</span>
                  <span className="text-muted-foreground">@{member.username}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {showNoCardMatchesHint ? (
          <div
            className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover px-2 py-1 text-xs text-muted-foreground shadow"
            role="status"
          >
            No matching cards — the card database may be empty.
          </div>
        ) : null}
        {activeTrigger?.kind === "card" && cardSuggestions.length > 0 ? (
          <ul
            className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-md border border-border bg-popover text-sm shadow"
            aria-label="Card suggestions"
          >
            {cardSuggestions.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left hover:bg-muted"
                  // onMouseDown so onBlur does not clear the suggestion first.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertCardMention(card.id, card.name);
                  }}
                >
                  <CardResultRow card={card} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending || isEmpty}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
