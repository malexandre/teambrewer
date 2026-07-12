import { UnprocessableEntityException } from "@nestjs/common";

import {
  allowedNextTestAssignmentStatuses,
  errorCode,
  isTestAssignmentStatusTransitionAllowed,
  type TestAssignmentStatus,
} from "@teambrewer/shared";

/**
 * Server-side enforcement of the test-assignment status lifecycle. The transition
 * rules live in `@teambrewer/shared` (`testAssignmentStatusTransitions`) so the API
 * and the web status control share one source of truth; this module adds only the
 * HTTP failure (422 → `DOMAIN_RULE_VIOLATION`).
 */

/** The statuses an assignment may move to from its current status (never itself). */
export function allowedNextStatuses(from: TestAssignmentStatus): TestAssignmentStatus[] {
  return allowedNextTestAssignmentStatuses(from);
}

/**
 * Assert a status transition is legal, throwing 422 otherwise. A no-op transition is
 * rejected because it is not a lifecycle move.
 */
export function assertAssignmentStatusTransition(
  from: TestAssignmentStatus,
  to: TestAssignmentStatus,
): void {
  if (!isTestAssignmentStatusTransitionAllowed(from, to)) {
    throw new UnprocessableEntityException({
      error: {
        code: errorCode.domainRuleViolation,
        message: `An assignment cannot move from "${from}" to "${to}".`,
      },
    });
  }
}
