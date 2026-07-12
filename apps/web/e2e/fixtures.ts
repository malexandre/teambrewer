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

/** Reference data the network-free `db:seed` provides (games + formats) for the decks spec. */
export const E2E_REFERENCE = {
  formatName: "Classic Constructed",
};

/** Where global-setup records the container id + API pid for global-teardown. */
export const RUNTIME_FILE = ".e2e-runtime.json";
