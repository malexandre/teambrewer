import { UnprocessableEntityException } from "@nestjs/common";

import { type DeckStatus, errorCode } from "@teambrewer/shared";

/**
 * The deck status lifecycle (docs/features/decks.md — permissive model). The
 * three active states move freely in both directions; any active state may be
 * retired; a retired deck is a reopenable terminal that returns only to
 * `testing`. A no-op (same status) is not a transition. This map is the single
 * source of truth; the controller offers only these moves and the service
 * enforces them.
 */
const ALLOWED_TRANSITIONS: Record<DeckStatus, readonly DeckStatus[]> = {
  exploratory: ["testing", "tournament_ready", "retired"],
  testing: ["exploratory", "tournament_ready", "retired"],
  tournament_ready: ["exploratory", "testing", "retired"],
  retired: ["testing"],
};

/** The statuses a deck may move to from its current status (never itself). */
export function allowedNextStatuses(from: DeckStatus): DeckStatus[] {
  return [...ALLOWED_TRANSITIONS[from]];
}

/** Whether a transition is permitted by the lifecycle. */
export function isDeckStatusTransitionAllowed(from: DeckStatus, to: DeckStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
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
