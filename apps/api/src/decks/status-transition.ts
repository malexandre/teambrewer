import { UnprocessableEntityException } from "@nestjs/common";

import {
  allowedNextDeckStatuses,
  type DeckStatus,
  errorCode,
  isDeckStatusTransitionAllowed,
} from "@teambrewer/shared";

/**
 * Server-side enforcement of the deck status lifecycle. The transition rules
 * themselves live in `@teambrewer/shared` (`deckStatusTransitions`) so the API
 * and the web status control share one source of truth; this module adds only the
 * HTTP failure (422 → `DOMAIN_RULE_VIOLATION`).
 */

/** The statuses a deck may move to from its current status (never itself). */
export function allowedNextStatuses(from: DeckStatus): DeckStatus[] {
  return allowedNextDeckStatuses(from);
}

/**
 * Assert a status transition is legal, throwing a 422 (mapped to
 * `DOMAIN_RULE_VIOLATION`) otherwise. A no-op transition is rejected because it
 * is not a lifecycle move.
 */
export function assertDeckStatusTransition(from: DeckStatus, to: DeckStatus): void {
  if (!isDeckStatusTransitionAllowed(from, to)) {
    throw new UnprocessableEntityException({
      error: {
        code: errorCode.domainRuleViolation,
        message: `A deck cannot move from "${from}" to "${to}".`,
      },
    });
  }
}
