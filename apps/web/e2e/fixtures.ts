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
 * A dedicated onboardable user for the game-plans journey — independent of the other
 * specs so they can run in parallel (each consumes its own single-use token). The
 * global-setup seeds this team a deck to write a matchup game-plan on.
 */
export const E2E_GAMEPLAN_USER = {
  id: "e2e-user-gameplan",
  username: "gameplan_user",
  displayName: "Gameplan User",
};
export const E2E_GAMEPLAN_SETUP_TOKEN = "e2e-gameplan-setup-token";
/** The team deck seeded on alpha the game-plans user writes a plan on. */
export const E2E_GAMEPLAN_DECK_NAME = "E2E Game-Plan Deck";

/**
 * A dedicated onboardable user for the core meta-pivot loop journey — independent of
 * the other specs (own single-use token). Belongs to alpha only. Drives the whole
 * primary loop through the UI: create a meta (for a format) with a tiered deck entry →
 * create a deck of that format (auto-linked to the format's most recent meta) →
 * readiness → add a card idea (a `+card` task) → advance the task with a report →
 * create an event linked to the meta and RSVP.
 */
export const E2E_METALOOP_USER = {
  id: "e2e-user-metaloop",
  username: "metaloop_user",
  displayName: "Metaloop User",
};
export const E2E_METALOOP_SETUP_TOKEN = "e2e-metaloop-setup-token";

/**
 * A dedicated onboardable user for the accessibility (axe) scan — independent of
 * the other specs so it runs in parallel (own single-use token). Only needs to
 * reach the read-only screens, so no extra seeded data.
 */
export const E2E_A11Y_USER = {
  id: "e2e-user-a11y",
  username: "a11y_user",
  displayName: "A11y User",
};
export const E2E_A11Y_SETUP_TOKEN = "e2e-a11y-setup-token";

/**
 * A dedicated onboardable user for the critical-path smoke suite — independent of
 * the other specs (own single-use token). Belongs to both teams (alpha first →
 * default active) to exercise the create-a-deck → team-switch isolation path.
 */
export const E2E_SMOKE_USER = {
  id: "e2e-user-smoke",
  username: "smoke_user",
  displayName: "Smoke User",
};
export const E2E_SMOKE_SETUP_TOKEN = "e2e-smoke-setup-token";
/** The deck the smoke suite creates on alpha and confirms is absent on bravo. */
export const E2E_SMOKE_DECK_NAME = "E2E Smoke Deck";

/**
 * Reference data for the specs. `formatName` comes from the network-free `db:seed`
 * (games + formats); `heroName` is a single hero the global-setup inserts after the
 * seed (heroes normally come from the network card sync, skipped in e2e).
 */
export const E2E_REFERENCE = {
  formatName: "Classic Constructed",
  heroName: "Dorinthea",
};

/** A FaB card the global-setup seeds so `+card` mentions and card capture resolve. */
export const E2E_CARD_NAME = "Command and Conquer";

/** Where global-setup records the container id + API pid for global-teardown. */
export const RUNTIME_FILE = ".e2e-runtime.json";
