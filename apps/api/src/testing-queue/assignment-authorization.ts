import type { TeamContext } from "../tenancy/team-context.js";

/**
 * Whether the acting member may modify (edit / transition / archive) a test
 * assignment: the member who created it, the assignee, or a team-admin moderating
 * within their team (per multi-tenancy.md §Roles — "create/edit own; admin can
 * manage all"). Any member may create/self-assign (checked at the endpoint); the
 * assignee needs to advance their own assignment's status. Read access is team-wide,
 * so this guards writes only.
 */
export function canModifyAssignment(
  team: TeamContext,
  assignment: { assignedById: string; assigneeId: string },
): boolean {
  return (
    assignment.assignedById === team.userId ||
    assignment.assigneeId === team.userId ||
    team.role === "team_admin"
  );
}
