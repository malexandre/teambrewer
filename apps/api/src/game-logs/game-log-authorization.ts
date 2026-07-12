import type { TeamContext } from "../tenancy/team-context.js";

/**
 * Whether the acting member may modify (edit/archive) a game log: the member who
 * logged it, or a team-admin moderating within their team. Unlike events (a shared
 * team board), a game log carries a logger and only they or an admin may change it —
 * editing its confidence factors re-derives the weight and shifts aggregates, so the
 * edit surface is deliberately narrow. Read access is team-wide (no private
 * visibility), so this guards writes only.
 */
export function canModifyGameLog(team: TeamContext, gameLog: { loggedById: string }): boolean {
  return gameLog.loggedById === team.userId || team.role === "team_admin";
}
