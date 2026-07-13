import { formatCardToken } from "@teambrewer/shared";
import { type FormEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { pitchDisplay } from "@/features/cards/pitch";
import { useCardSearch } from "@/features/cards/use-card-search";
import { useDebouncedValue } from "@/features/cards/use-debounced-value";
import { useMembers } from "@/features/teams/use-members";

/** The caret position of a token: `token` is the text typed after the trigger char. */
interface TriggerMatch {
  token: string;
  /** Index of the token's first character (i.e. just after the trigger char). */
  start: number;
}

/**
 * The in-progress mention/card token immediately before the caret. `@member`
 * tokens use the identifier charset; `+card` tokens allow spaces (card names
 * contain them) but stop at another `+` or a token delimiter so the query stays
 * bounded to the run typed after the most recent `+`.
 */
type ActiveTrigger = ({ kind: "member" } | { kind: "card" }) & TriggerMatch;

/** The in-progress `@token` immediately before the caret, or null if none. */
function activeMentionToken(value: string, caret: number): TriggerMatch | null {
  const upToCaret = value.slice(0, caret);
  const match = /(?:^|[^A-Za-z0-9._-])@([A-Za-z0-9._-]*)$/.exec(upToCaret);
  if (!match) {
    return null;
  }
  const token = match[1] ?? "";
  return { token, start: caret - token.length };
}

/**
 * The in-progress `+token` immediately before the caret, or null if none. The
 * query allows spaces (card names have them) but excludes `+`, `[`, and `]`, so
 * it never spills across a completed `+[[cardId]]` token or into a second `+`.
 */
function activeCardToken(value: string, caret: number): TriggerMatch | null {
  const upToCaret = value.slice(0, caret);
  const match = /(?:^|\s)\+([^+\n[\]]*)$/.exec(upToCaret);
  if (!match) {
    return null;
  }
  const token = match[1] ?? "";
  return { token, start: caret - token.length };
}

function detectActiveTrigger(
  value: string,
  caret: number,
  enableMemberMentions: boolean,
  enableCardMentions: boolean,
): ActiveTrigger | null {
  if (enableCardMentions) {
    const card = activeCardToken(value, caret);
    if (card) {
      return { kind: "card", ...card };
    }
  }
  if (enableMemberMentions) {
    const member = activeMentionToken(value, caret);
    if (member) {
      return { kind: "member", ...member };
    }
  }
  return null;
}

/**
 * A prose composer with inline autocomplete. `@`-mentions autocomplete over the
 * active team's members only (fetched via {@link useMembers}, X-Team-Id scoped,
 * so another team's users can never appear) and insert a bare `@username`.
 * `+`-mentions autocomplete cards via {@link useCardSearch} (also team-scoped)
 * and insert the stable token `+[[cardId]]` (card names have spaces, so the token
 * carries the id, not the name — see `card-tokens` in `@teambrewer/shared`).
 *
 * Consumers pick the triggers: comments enable members only (the default),
 * while `+card`-enabled prose fields (task descriptions, game-plan bodies, deck
 * notes) opt into cards, and either can run alone or together.
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
  /** Enable `+card` autocomplete (a `+[[cardId]]` token on select). Defaults to false. */
  enableCardMentions?: boolean;
}) {
  const { data: memberData } = useMembers(teamId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initialValue);
  const [activeTrigger, setActiveTrigger] = useState<ActiveTrigger | null>(null);

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
  const { data: cardData } = useCardSearch(
    teamId,
    { query: debouncedCardQuery },
    { enabled: enableCardMentions && debouncedCardQuery.length > 0 },
  );
  const cardSuggestions =
    activeTrigger?.kind === "card" && debouncedCardQuery.length > 0 ? (cardData?.data ?? []) : [];

  function refreshTrigger(target: HTMLTextAreaElement): void {
    setActiveTrigger(
      detectActiveTrigger(
        target.value,
        target.selectionStart ?? target.value.length,
        enableMemberMentions,
        enableCardMentions,
      ),
    );
  }

  function insertMemberMention(username: string): void {
    if (activeTrigger?.kind !== "member") return;
    const before = value.slice(0, activeTrigger.start);
    const after = value.slice(activeTrigger.start + activeTrigger.token.length);
    const next = `${before}${username} ${after}`;
    setValue(next);
    setActiveTrigger(null);
    textareaRef.current?.focus();
  }

  function insertCardMention(cardId: string): void {
    if (activeTrigger?.kind !== "card") return;
    // Drop the typed `+query` (the `+` sits one char before `start`) and write
    // the stable token in its place, followed by a space.
    const before = value.slice(0, activeTrigger.start - 1);
    const after = value.slice(activeTrigger.start + activeTrigger.token.length);
    const next = `${before}${formatCardToken(cardId)} ${after}`;
    setValue(next);
    setActiveTrigger(null);
    textareaRef.current?.focus();
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
    setActiveTrigger(null);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="relative">
        <textarea
          ref={textareaRef}
          className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-sm"
          placeholder={placeholder}
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            refreshTrigger(event.target);
          }}
          onKeyUp={(event) => refreshTrigger(event.currentTarget)}
          onClick={(event) => refreshTrigger(event.currentTarget)}
          onBlur={() => setActiveTrigger(null)}
        />
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
                  // Use onMouseDown so the textarea's onBlur does not clear the
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
        {activeTrigger?.kind === "card" && cardSuggestions.length > 0 ? (
          <ul
            className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-md border border-border bg-popover text-sm shadow"
            aria-label="Card suggestions"
          >
            {cardSuggestions.map((card) => {
              const pitch = pitchDisplay(card.pitch);
              return (
                <li key={card.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left hover:bg-muted"
                    // onMouseDown so onBlur does not clear the suggestion first.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      insertCardMention(card.id);
                    }}
                  >
                    <span className="font-medium">{card.name}</span>
                    {pitch ? <span className="text-muted-foreground">{pitch}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending || !value.trim()}>
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
