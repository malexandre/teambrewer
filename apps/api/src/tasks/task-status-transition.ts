import { UnprocessableEntityException } from "@nestjs/common";

import {
  allowedNextTaskStatuses,
  errorCode,
  isTaskStatusTransitionAllowed,
  type TaskStatus,
  taskStatusRequiresReport,
} from "@teambrewer/shared";

/**
 * Server-side enforcement of the task status lifecycle. The transition rules and
 * the report-on-finish requirement live in `@teambrewer/shared`
 * (`taskStatusTransitions`) so the API validator and the web status control share
 * one source of truth; this module adds only the HTTP failures (422 →
 * `DOMAIN_RULE_VIOLATION`).
 */

/** The statuses a task may move to from its current status (never itself). */
export function allowedNextStatuses(from: TaskStatus): TaskStatus[] {
  return allowedNextTaskStatuses(from);
}

/**
 * Assert a status transition is legal, throwing 422 otherwise. A no-op transition is
 * rejected because it is not a lifecycle move.
 */
export function assertTaskStatusTransition(from: TaskStatus, to: TaskStatus): void {
  if (!isTaskStatusTransitionAllowed(from, to)) {
    throw new UnprocessableEntityException({
      error: {
        code: errorCode.domainRuleViolation,
        message: `A task cannot move from "${from}" to "${to}".`,
      },
    });
  }
}

/**
 * Assert that finishing a task carries a durable conclusion: moving to `finished`
 * requires a non-empty report (422 otherwise), so the team's outcome survives.
 * `report` is the value merged from the update input and the stored row.
 */
export function assertReportPresent(to: TaskStatus, report: string): void {
  if (taskStatusRequiresReport(to) && report.trim().length === 0) {
    throw new UnprocessableEntityException({
      error: {
        code: errorCode.domainRuleViolation,
        message: `Finishing a task requires a report.`,
      },
    });
  }
}
