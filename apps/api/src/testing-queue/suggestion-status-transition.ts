import { UnprocessableEntityException } from "@nestjs/common";

import {
  allowedNextCardTestSuggestionStatuses,
  type CardTestSuggestionStatus,
  cardTestSuggestionStatusRequiresResolutionNote,
  errorCode,
  isCardTestSuggestionStatusTransitionAllowed,
} from "@teambrewer/shared";

/**
 * Server-side enforcement of the card-test-suggestion status lifecycle. The
 * transition rules and the resolution-note requirement live in `@teambrewer/shared`
 * (`cardTestSuggestionStatusTransitions`) so the API and the web status control share
 * one source of truth; this module adds only the HTTP failures (422 →
 * `DOMAIN_RULE_VIOLATION`).
 */

/** The statuses a suggestion may move to from its current status (never itself). */
export function allowedNextStatuses(from: CardTestSuggestionStatus): CardTestSuggestionStatus[] {
  return allowedNextCardTestSuggestionStatuses(from);
}

/**
 * Assert a status transition is legal, throwing 422 otherwise. A no-op transition is
 * rejected because it is not a lifecycle move.
 */
export function assertSuggestionStatusTransition(
  from: CardTestSuggestionStatus,
  to: CardTestSuggestionStatus,
): void {
  if (!isCardTestSuggestionStatusTransitionAllowed(from, to)) {
    throw new UnprocessableEntityException({
      error: {
        code: errorCode.domainRuleViolation,
        message: `A suggestion cannot move from "${from}" to "${to}".`,
      },
    });
  }
}

/**
 * Assert that resolving to `to` carries a durable conclusion: moving to
 * `adopted`/`rejected` requires a non-empty resolution note (422 otherwise), so the
 * team's reasoning survives. `resolutionNote` is the value merged from the update
 * input and the stored row.
 */
export function assertResolutionNotePresent(
  to: CardTestSuggestionStatus,
  resolutionNote: string,
): void {
  if (cardTestSuggestionStatusRequiresResolutionNote(to) && resolutionNote.trim().length === 0) {
    throw new UnprocessableEntityException({
      error: {
        code: errorCode.domainRuleViolation,
        message: `Resolving a suggestion to "${to}" requires a resolution note.`,
      },
    });
  }
}
