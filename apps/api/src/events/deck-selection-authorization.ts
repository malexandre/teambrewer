import { ForbiddenException, UnprocessableEntityException } from "@nestjs/common";
import { errorCode } from "@teambrewer/shared";

import type { TeamContext } from "../tenancy/team-context.js";

/**
 * Deck-selection lock authorization (docs/features/gameplans-and-deck-selection.md
 * §Deck selection). Locking a roster is a team-admin action: only a team-admin may
 * set `locked = true` (stamping `lockedAt`) or unlock it again. Members edit only
 * their own selection, and only while it is unlocked.
 */

/** Reject a non-admin attempting to lock/unlock a selection (→ 403). */
export function assertCanLockDeckSelection(team: TeamContext): void {
  if (team.role !== "team_admin") {
    throw new ForbiddenException({
      error: {
        code: errorCode.forbidden,
        message: "Only a team-admin can lock or unlock a deck selection.",
      },
    });
  }
}

/**
 * Reject a member editing their own selection while it is locked (→ 422). A locked
 * selection is frozen until a team-admin unlocks it, so nobody quietly changes course.
 */
export function assertDeckSelectionEditable(locked: boolean): void {
  if (locked) {
    throw new UnprocessableEntityException({
      error: {
        code: errorCode.domainRuleViolation,
        message: "This deck selection is locked. A team-admin must unlock it before it can change.",
      },
    });
  }
}
