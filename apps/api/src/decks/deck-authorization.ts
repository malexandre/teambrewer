import type { TeamContext } from "../tenancy/team-context.js";

/**
 * Whether the acting member may modify (edit/retire/archive/annotate) a deck:
 * its owner, or a team-admin moderating within their team. Instance-admins act
 * through the team context too (they carry a team role when operating on a team's
 * data). Read visibility is handled separately (see `isDeckVisibleTo`).
 */
export function canModifyDeck(team: TeamContext, deck: { ownerId: string }): boolean {
  return deck.ownerId === team.userId || team.role === "team_admin";
}

/**
 * Whether the acting member may see a deck. `team`-visibility decks are visible
 * to every member; a `private` draft is visible only to its owner and to
 * team-admins (who moderate). The list endpoint applies the equivalent rule in
 * its query; this guards single-deck reads.
 */
export function isDeckVisibleTo(
  team: TeamContext,
  deck: { ownerId: string; visibility: string },
): boolean {
  if (deck.visibility !== "private") {
    return true;
  }
  return deck.ownerId === team.userId || team.role === "team_admin";
}
