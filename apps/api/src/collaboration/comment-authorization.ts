import type { TeamContext } from "../tenancy/team-context.js";

/**
 * Whether the acting member may edit or soft-delete a comment: its author, or a
 * team-admin moderating within their team (collaboration-core.md "editing/
 * deleting"). Read access to a comment is governed by the subject's visibility,
 * not this helper.
 */
export function canModifyComment(team: TeamContext, comment: { authorId: string }): boolean {
  return comment.authorId === team.userId || team.role === "team_admin";
}
