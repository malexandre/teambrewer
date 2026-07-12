/** Constants shared between the e2e global setup (seeding) and the specs. */

export const E2E_SETUP_TOKEN = "e2e-canonical-setup-token";
export const E2E_PASSWORD = "e2e-strong-passphrase-01";

export const E2E_TEAMS = {
  alpha: { id: "e2e-team-alpha", name: "Alpha E2E", slug: "alpha-e2e", extraMember: "Alpha Two" },
  bravo: { id: "e2e-team-bravo", name: "Bravo E2E", slug: "bravo-e2e", extraMember: "Bravo Two" },
};

export const E2E_ONBOARDING_USER = {
  id: "e2e-user-onboarding",
  username: "onboarding_user",
  displayName: "Onboarding User",
};

/**
 * A second onboardable user for the decks journey — independent of the onboarding
 * spec so the two can run in parallel (each consumes its own single-use token).
 * Belongs to both teams (alpha first → default active) to exercise deck isolation
 * across a team switch.
 */
export const E2E_DECKS_USER = {
  id: "e2e-user-decks",
  username: "decks_user",
  displayName: "Decks User",
};
export const E2E_DECKS_SETUP_TOKEN = "e2e-decks-setup-token";

/**
 * Two onboardable teammates on the alpha team for the collaboration journey: the
 * author posts a comment mentioning the other, who then sees the notification.
 * Independent tokens so this spec runs in parallel with the others.
 */
export const E2E_COLLAB_AUTHOR = {
  id: "e2e-user-collab-author",
  username: "collab_author",
  displayName: "Collab Author",
};
export const E2E_COLLAB_AUTHOR_SETUP_TOKEN = "e2e-collab-author-setup-token";
export const E2E_COLLAB_MENTIONED = {
  id: "e2e-user-collab-mentioned",
  username: "collab_mentioned",
  displayName: "Collab Mentioned",
};
export const E2E_COLLAB_MENTIONED_SETUP_TOKEN = "e2e-collab-mentioned-setup-token";

/**
 * A dedicated onboardable user for the events journey — independent of the other
 * specs so they can run in parallel (each consumes its own single-use token).
 * Belongs to both teams (alpha first → default active) to exercise event isolation
 * across a team switch.
 */
export const E2E_EVENTS_USER = {
  id: "e2e-user-events",
  username: "events_user",
  displayName: "Events User",
};
export const E2E_EVENTS_SETUP_TOKEN = "e2e-events-setup-token";

/**
 * A dedicated onboardable user for the game-logging journey — independent of the
 * other specs so they can run in parallel (each consumes its own single-use token).
 * Belongs to both teams (alpha first → default active) to exercise game-log
 * isolation across a team switch.
 */
export const E2E_GAMELOG_USER = {
  id: "e2e-user-gamelog",
  username: "gamelog_user",
  displayName: "Gamelog User",
};
export const E2E_GAMELOG_SETUP_TOKEN = "e2e-gamelog-setup-token";
/** A team deck seeded on alpha for the game-logging user to log games with. */
export const E2E_GAMELOG_DECK_NAME = "E2E Rhinar Aggro";

/**
 * A dedicated onboardable user for the matchups journey — independent of the other
 * specs so they can run in parallel (each consumes its own single-use token).
 * Belongs to both teams (alpha first → default active) to exercise matchup
 * isolation across a team switch. The global-setup seeds this team a deck, an
 * event with a gauntlet, and a couple of game logs so the matrix + coverage have
 * real numbers without driving the (phone-oriented) logging wizard on desktop.
 */
export const E2E_MATCHUP_USER = {
  id: "e2e-user-matchup",
  username: "matchup_user",
  displayName: "Matchup User",
};
export const E2E_MATCHUP_SETUP_TOKEN = "e2e-matchup-setup-token";
/** The team deck seeded on alpha whose matchup vs the seeded hero the matrix shows. */
export const E2E_MATCHUP_DECK_NAME = "E2E Matchup Deck";
/** The event (with a gauntlet) seeded on alpha for the coverage tracker. */
export const E2E_MATCHUP_EVENT_NAME = "E2E Matchup Cup";

/**
 * Reference data for the specs. `formatName` comes from the network-free `db:seed`
 * (games + formats); `heroName` is a single hero the events e2e global-setup inserts
 * after the seed (heroes normally come from the network card sync, skipped in e2e).
 */
export const E2E_REFERENCE = {
  formatName: "Classic Constructed",
  heroName: "Dorinthea",
};

/** Where global-setup records the container id + API pid for global-teardown. */
export const RUNTIME_FILE = ".e2e-runtime.json";
