import { UnprocessableEntityException } from "@nestjs/common";

import { errorCode, isPollStatusTransitionAllowed, type PollStatus } from "@teambrewer/shared";

/**
 * Server-side enforcement of the poll status lifecycle. The transition rules themselves
 * live in `@teambrewer/shared` (`pollStatusTransitions`) so the API and the web control
 * share one source of truth; this module adds only the HTTP failure (422 →
 * `DOMAIN_RULE_VIOLATION`). Reopening a poll whose `closesAt` has passed is additionally
 * rejected in the service.
 */
export function assertPollStatusTransition(from: PollStatus, to: PollStatus): void {
  if (!isPollStatusTransitionAllowed(from, to)) {
    throw new UnprocessableEntityException({
      error: {
        code: errorCode.domainRuleViolation,
        message: `A poll cannot move from "${from}" to "${to}".`,
      },
    });
  }
}
