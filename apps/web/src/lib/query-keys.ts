/**
 * Central TanStack Query key factory. Team-scoped keys put the active `teamId`
 * first (`[teamId, resource, ...params]`), so switching the active team yields a
 * different cache entry and one team's data can never bleed into another's
 * (security-and-tenancy rule). Global/self keys are not team-scoped.
 */
export const queryKeys = {
  me: () => ["me"] as const,
  myTeams: () => ["me", "teams"] as const,
  mySessions: () => ["me", "sessions"] as const,

  /** Members of the active team (member-facing, X-Team-Id scoped). */
  members: (teamId: string) => [teamId, "members"] as const,

  adminTeams: () => ["admin", "teams"] as const,
  adminMembers: (teamId: string) => ["admin", teamId, "members"] as const,
} as const;
