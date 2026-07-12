import { type FormEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useMembers } from "@/features/teams/use-members";

/** The in-progress `@token` immediately before the caret, or null if none. */
function activeMentionToken(value: string, caret: number): { token: string; start: number } | null {
  const upToCaret = value.slice(0, caret);
  const match = /(?:^|[^A-Za-z0-9._-])@([A-Za-z0-9._-]*)$/.exec(upToCaret);
  if (!match) {
    return null;
  }
  const token = match[1] ?? "";
  return { token, start: caret - token.length };
}

/**
 * A comment composer with `@`-mention autocomplete over the active team's members
 * only (fetched via {@link useMembers}, which is X-Team-Id scoped, so another
 * team's users can never appear). Used for new comments, replies, and edits.
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
}: {
  teamId: string | undefined;
  initialValue?: string;
  submitLabel: string;
  placeholder: string;
  ariaLabel: string;
  isPending: boolean;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
}) {
  const { data: memberData } = useMembers(teamId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initialValue);
  const [mention, setMention] = useState<{ token: string; start: number } | null>(null);

  const members = memberData?.data ?? [];
  const suggestions = mention
    ? members.filter((member) => {
        const token = mention.token.toLowerCase();
        return (
          member.username.toLowerCase().includes(token) ||
          member.displayName.toLowerCase().includes(token)
        );
      })
    : [];

  function refreshMention(target: HTMLTextAreaElement): void {
    setMention(activeMentionToken(target.value, target.selectionStart ?? target.value.length));
  }

  function insertMention(username: string): void {
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(mention.start + mention.token.length);
    const next = `${before}${username} ${after}`;
    setValue(next);
    setMention(null);
    textareaRef.current?.focus();
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
    setMention(null);
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
            refreshMention(event.target);
          }}
          onKeyUp={(event) => refreshMention(event.currentTarget)}
          onClick={(event) => refreshMention(event.currentTarget)}
          onBlur={() => setMention(null)}
        />
        {mention && suggestions.length > 0 ? (
          <ul
            className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-md border border-border bg-popover text-sm shadow"
            aria-label="Mention suggestions"
          >
            {suggestions.map((member) => (
              <li key={member.userId}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-muted"
                  // Use onMouseDown so the textarea's onBlur does not clear the
                  // suggestion before the click registers.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMention(member.username);
                  }}
                >
                  <span className="font-medium">{member.displayName}</span>
                  <span className="text-muted-foreground">@{member.username}</span>
                </button>
              </li>
            ))}
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
