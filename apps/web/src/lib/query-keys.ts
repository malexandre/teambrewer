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

  /**
   * Card reference data, keyed by the active team first so it is fetched for (and
   * scoped to) the team's game and switching teams refetches the right game's
   * data. The backend filters by the team's game; the key mirrors that isolation.
   */
  cardSearch: (teamId: string, params: { query?: string; pitch?: number }) =>
    [teamId, "cards", params] as const,
  card: (teamId: string, cardId: string) => [teamId, "card", cardId] as const,
  formats: (teamId: string) => [teamId, "formats"] as const,
  heroes: (teamId: string) => [teamId, "heroes"] as const,
  cardDataVersion: (teamId: string) => [teamId, "card-data-version"] as const,

  /**
   * Decks, keyed by the active team first so switching teams yields a different
   * cache entry and one team's decks never bleed into another's. `filters` keys
   * the list variant so each filter combination caches independently.
   */
  decks: (teamId: string, filters: Record<string, string | boolean>) =>
    [teamId, "decks", filters] as const,
  deck: (teamId: string, deckId: string) => [teamId, "deck", deckId] as const,
  deckIterations: (teamId: string, deckId: string) =>
    [teamId, "deck", deckId, "iterations"] as const,

  /**
   * Collaboration keys, all team-scoped (teamId first) so switching teams yields
   * a different cache entry and one team's discussion/awareness never bleeds into
   * another's. Comments are keyed by their polymorphic subject; notifications are
   * the caller's own within the active team; activity is the team feed (an
   * optional subject filter keys its own variant).
   */
  comments: (teamId: string, subjectType: string, subjectId: string) =>
    [teamId, "comments", subjectType, subjectId] as const,
  notifications: (teamId: string, params: { unreadOnly?: boolean }) =>
    [teamId, "notifications", params] as const,
  activity: (teamId: string, filters: Record<string, string>) =>
    [teamId, "activity", filters] as const,
} as const;
