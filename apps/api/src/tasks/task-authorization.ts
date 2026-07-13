import type { UpdateTaskInput } from "@teambrewer/shared";

import type { TeamContext } from "../tenancy/team-context.js";

/**
 * Whether the acting member may modify (edit / advance / archive) a task: the
 * member who authored it, its current assignee, or a team-admin moderating within
 * their team (per multi-tenancy.md §Roles — "create/edit own; admin can manage
 * all"). Any member may create + vote (checked at the endpoint) and may self-assign
 * a task even without this permission (see {@link isSelfAssignmentOnly}); the
 * assignee needs to advance their own task's status. Read access is team-wide, so
 * this guards writes only.
 */
export function canModifyTask(
  team: TeamContext,
  task: { authorId: string; assigneeId: string | null },
): boolean {
  return (
    task.authorId === team.userId || task.assigneeId === team.userId || team.role === "team_admin"
  );
}

/**
 * Whether an update is a pure self-assignment — the caller assigning the task to
 * themselves and changing nothing else. Any verified member may do this (picking up
 * a proposed task), even if they are neither the author, the current assignee, nor a
 * team-admin. Every other field being absent keeps this from being a back-door edit.
 */
export function isSelfAssignmentOnly(team: TeamContext, input: UpdateTaskInput): boolean {
  return (
    input.assigneeId === team.userId &&
    input.title === undefined &&
    input.description === undefined &&
    input.deckId === undefined &&
    input.status === undefined &&
    input.report === undefined
  );
}
