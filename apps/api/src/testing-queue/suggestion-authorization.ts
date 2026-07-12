import type { TeamContext } from "../tenancy/team-context.js";

/**
 * Whether the acting member may modify (edit / transition / archive) a card-test
 * suggestion: its author, or a team-admin moderating within their team. Any member
 * may create a suggestion and vote (checked at the endpoint); only the author or an
 * admin may change an existing one (per multi-tenancy.md §Roles). Read access is
 * team-wide, so this guards writes only.
 */
export function canModifySuggestion(team: TeamContext, suggestion: { authorId: string }): boolean {
  return suggestion.authorId === team.userId || team.role === "team_admin";
}
