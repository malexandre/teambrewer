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

/** Where global-setup records the container id + API pid for global-teardown. */
export const RUNTIME_FILE = ".e2e-runtime.json";
