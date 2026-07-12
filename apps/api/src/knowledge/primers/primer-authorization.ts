import type { TeamContext } from "../../tenancy/team-context.js";

/**
 * Whether the acting member may see a primer. `team`-visibility primers are visible to
 * every member; a `private` draft is visible only to its author and to team-admins (who
 * moderate). The list endpoint applies the equivalent rule in its query; this guards
 * single-primer reads and edits. Mirrors deck visibility semantics
 * (docs/features/team-knowledge.md).
 */
export function isPrimerVisibleTo(
  team: TeamContext,
  primer: { authorId: string; visibility: string },
): boolean {
  if (primer.visibility !== "private") {
    return true;
  }
  return primer.authorId === team.userId || team.role === "team_admin";
}

/**
 * Whether the acting member may archive (soft-delete) a primer: its author, or a
 * team-admin moderating within their team. Editing a visible primer is open to any
 * member (shared team knowledge), but archiving is restricted to the author or an admin.
 */
export function canArchivePrimer(team: TeamContext, primer: { authorId: string }): boolean {
  return primer.authorId === team.userId || team.role === "team_admin";
}
