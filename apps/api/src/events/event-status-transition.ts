import { UnprocessableEntityException } from "@nestjs/common";

import {
  allowedNextEventStatuses,
  type EventStatus,
  errorCode,
  isEventStatusTransitionAllowed,
} from "@teambrewer/shared";

/**
 * Server-side enforcement of the event status lifecycle. The transition rules
 * themselves live in `@teambrewer/shared` (`eventStatusTransitions`) so the API
 * and the web status control share one source of truth; this module adds only the
 * HTTP failure (422 → `DOMAIN_RULE_VIOLATION`).
 */

/** The statuses an event may move to from its current status (never itself). */
export function allowedNextStatuses(from: EventStatus): EventStatus[] {
  return allowedNextEventStatuses(from);
}

/**
 * Assert a status transition is legal, throwing a 422 (mapped to
 * `DOMAIN_RULE_VIOLATION`) otherwise. A no-op transition is rejected because it is
 * not a lifecycle move.
 */
export function assertEventStatusTransition(from: EventStatus, to: EventStatus): void {
  if (!isEventStatusTransitionAllowed(from, to)) {
    throw new UnprocessableEntityException({
      error: {
        code: errorCode.domainRuleViolation,
        message: `An event cannot move from "${from}" to "${to}".`,
      },
    });
  }
}
