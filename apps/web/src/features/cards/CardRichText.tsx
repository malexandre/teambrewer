import { parseCardTokens, tokenizeCardBody } from "@teambrewer/shared";
import { Fragment, useMemo } from "react";

import { CardChip } from "./CardChip";
import { useCardsById } from "./use-cards-by-id";

interface CardRichTextProps {
  /** The active team; card ids resolve against its game (X-Team-Id scoped). */
  teamId: string | undefined;
  /** The prose body, possibly containing `+[[cardId]]` tokens. */
  body: string;
  /** Optional class for the wrapping element (defaults to whitespace-preserving prose). */
  className?: string;
}

/**
 * Renders a prose body with inline `+[[cardId]]` tokens resolved to {@link
 * CardChip}s (name + hover/press image preview); everything else — including
 * any `@username` text — renders as plain, escaped text (React escapes text
 * nodes, so a script-laden body is inert). `@member` mentions keep their own
 * comment-only rendering path elsewhere.
 */
export function CardRichText({ teamId, body, className }: CardRichTextProps) {
  const cardIds = useMemo(() => parseCardTokens(body), [body]);
  const segments = useMemo(() => tokenizeCardBody(body), [body]);
  const cardsById = useCardsById(teamId, cardIds);

  return (
    <span className={className ?? "whitespace-pre-wrap"}>
      {segments.map((segment, index) =>
        segment.type === "text" ? (
          <Fragment key={index}>{segment.text}</Fragment>
        ) : (
          <CardChip key={index} card={cardsById.get(segment.cardId)} />
        ),
      )}
    </span>
  );
}
