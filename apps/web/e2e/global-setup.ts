import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";

import {
  E2E_A11Y_SETUP_TOKEN,
  E2E_A11Y_USER,
  E2E_CARD_NAME,
  E2E_COLLAB_AUTHOR,
  E2E_COLLAB_AUTHOR_SETUP_TOKEN,
  E2E_COLLAB_MENTIONED,
  E2E_COLLAB_MENTIONED_SETUP_TOKEN,
  E2E_DECKS_SETUP_TOKEN,
  E2E_DECKS_USER,
  E2E_EVENTS_SETUP_TOKEN,
  E2E_EVENTS_USER,
  E2E_GAMEPLAN_DECK_NAME,
  E2E_GAMEPLAN_SETUP_TOKEN,
  E2E_GAMEPLAN_USER,
  E2E_GAMELOG_DECK_NAME,
  E2E_GAMELOG_SETUP_TOKEN,
  E2E_GAMELOG_USER,
  E2E_METALOOP_SETUP_TOKEN,
  E2E_METALOOP_USER,
  E2E_ONBOARDING_USER,
  E2E_REFERENCE,
  E2E_SETUP_TOKEN,
  E2E_SMOKE_SETUP_TOKEN,
  E2E_SMOKE_USER,
  E2E_TEAMS,
  RUNTIME_FILE,
} from "./fixtures";

const repoRoot = resolve(import.meta.dirname, "../../..");
const apiDir = resolve(repoRoot, "apps/api");
const API_PORT = 3000;
const BETTER_AUTH_SECRET = "e2e-better-auth-secret-please-change-0123456789";

async function seed(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const now = new Date().toISOString();
    async function insertUser(id: string, username: string, displayName: string) {
      await client.query(
        `INSERT INTO "user"
           (id, name, email, email_verified, updated_at, two_factor_enabled, username,
            display_username, display_name, is_instance_admin, auth_method)
         VALUES ($1,$2,$3,true,$4,false,$5,$5,$6,false,'password_totp')`,
        [id, displayName, `${username}@users.teambrewer.local`, now, username, displayName],
      );
    }
    async function insertTeam(id: string, name: string, slug: string) {
      await client.query(
        `INSERT INTO "team" (id, name, slug, game_id, created_by, updated_at)
         VALUES ($1,$2,$3,'flesh-and-blood','system',$4)`,
        [id, name, slug, now],
      );
    }
    async function addMembership(
      teamId: string,
      userId: string,
      role: "member" | "team_admin" = "member",
    ) {
      await client.query(
        `INSERT INTO "team_membership" (id, team_id, user_id, role) VALUES ($1,$2,$3,$4)`,
        [randomUUID(), teamId, userId, role],
      );
    }
    async function insertSetupToken(userId: string, rawToken: string) {
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await client.query(
        `INSERT INTO "invite_token" (id, user_id, purpose, token_hash, expires_at)
         VALUES ($1,$2,'setup',$3,$4)`,
        [randomUUID(), userId, tokenHash, expiresAt],
      );
    }

    await insertTeam(E2E_TEAMS.alpha.id, E2E_TEAMS.alpha.name, E2E_TEAMS.alpha.slug);
    await insertTeam(E2E_TEAMS.bravo.id, E2E_TEAMS.bravo.name, E2E_TEAMS.bravo.slug);

    await insertUser(
      E2E_ONBOARDING_USER.id,
      E2E_ONBOARDING_USER.username,
      E2E_ONBOARDING_USER.displayName,
    );
    const alphaTwo = "e2e-user-alpha-two";
    const bravoTwo = "e2e-user-bravo-two";
    await insertUser(alphaTwo, "alpha_two", E2E_TEAMS.alpha.extraMember);
    await insertUser(bravoTwo, "bravo_two", E2E_TEAMS.bravo.extraMember);

    // The onboarding user belongs to BOTH teams (alpha first -> default active).
    await addMembership(E2E_TEAMS.alpha.id, E2E_ONBOARDING_USER.id);
    await addMembership(E2E_TEAMS.bravo.id, E2E_ONBOARDING_USER.id);
    await addMembership(E2E_TEAMS.alpha.id, alphaTwo);
    await addMembership(E2E_TEAMS.bravo.id, bravoTwo);

    // The decks user also belongs to both teams (alpha first -> default active).
    await insertUser(E2E_DECKS_USER.id, E2E_DECKS_USER.username, E2E_DECKS_USER.displayName);
    await addMembership(E2E_TEAMS.alpha.id, E2E_DECKS_USER.id);
    await addMembership(E2E_TEAMS.bravo.id, E2E_DECKS_USER.id);

    // The events user also belongs to both teams (alpha first -> default active).
    await insertUser(E2E_EVENTS_USER.id, E2E_EVENTS_USER.username, E2E_EVENTS_USER.displayName);
    await addMembership(E2E_TEAMS.alpha.id, E2E_EVENTS_USER.id);
    await addMembership(E2E_TEAMS.bravo.id, E2E_EVENTS_USER.id);

    // The game-logging user also belongs to both teams (alpha first -> default active).
    await insertUser(E2E_GAMELOG_USER.id, E2E_GAMELOG_USER.username, E2E_GAMELOG_USER.displayName);
    await addMembership(E2E_TEAMS.alpha.id, E2E_GAMELOG_USER.id);
    await addMembership(E2E_TEAMS.bravo.id, E2E_GAMELOG_USER.id);

    // The game-plans user belongs to both teams (alpha first -> default active).
    await insertUser(
      E2E_GAMEPLAN_USER.id,
      E2E_GAMEPLAN_USER.username,
      E2E_GAMEPLAN_USER.displayName,
    );
    await addMembership(E2E_TEAMS.alpha.id, E2E_GAMEPLAN_USER.id);
    await addMembership(E2E_TEAMS.bravo.id, E2E_GAMEPLAN_USER.id);

    // The core-loop user belongs to alpha only.
    await insertUser(
      E2E_METALOOP_USER.id,
      E2E_METALOOP_USER.username,
      E2E_METALOOP_USER.displayName,
    );
    await addMembership(E2E_TEAMS.alpha.id, E2E_METALOOP_USER.id);

    // The accessibility-scan user belongs to both teams (alpha first -> default active).
    await insertUser(E2E_A11Y_USER.id, E2E_A11Y_USER.username, E2E_A11Y_USER.displayName);
    await addMembership(E2E_TEAMS.alpha.id, E2E_A11Y_USER.id);
    await addMembership(E2E_TEAMS.bravo.id, E2E_A11Y_USER.id);

    // The smoke-suite user belongs to both teams (alpha first -> default active).
    await insertUser(E2E_SMOKE_USER.id, E2E_SMOKE_USER.username, E2E_SMOKE_USER.displayName);
    await addMembership(E2E_TEAMS.alpha.id, E2E_SMOKE_USER.id);
    await addMembership(E2E_TEAMS.bravo.id, E2E_SMOKE_USER.id);

    // Two collaboration teammates on alpha only (mentions resolve within a team).
    await insertUser(
      E2E_COLLAB_AUTHOR.id,
      E2E_COLLAB_AUTHOR.username,
      E2E_COLLAB_AUTHOR.displayName,
    );
    await insertUser(
      E2E_COLLAB_MENTIONED.id,
      E2E_COLLAB_MENTIONED.username,
      E2E_COLLAB_MENTIONED.displayName,
    );
    await addMembership(E2E_TEAMS.alpha.id, E2E_COLLAB_AUTHOR.id);
    await addMembership(E2E_TEAMS.alpha.id, E2E_COLLAB_MENTIONED.id);

    await insertSetupToken(E2E_ONBOARDING_USER.id, E2E_SETUP_TOKEN);
    await insertSetupToken(E2E_DECKS_USER.id, E2E_DECKS_SETUP_TOKEN);
    await insertSetupToken(E2E_EVENTS_USER.id, E2E_EVENTS_SETUP_TOKEN);
    await insertSetupToken(E2E_GAMELOG_USER.id, E2E_GAMELOG_SETUP_TOKEN);
    await insertSetupToken(E2E_COLLAB_AUTHOR.id, E2E_COLLAB_AUTHOR_SETUP_TOKEN);
    await insertSetupToken(E2E_COLLAB_MENTIONED.id, E2E_COLLAB_MENTIONED_SETUP_TOKEN);
    await insertSetupToken(E2E_GAMEPLAN_USER.id, E2E_GAMEPLAN_SETUP_TOKEN);
    await insertSetupToken(E2E_METALOOP_USER.id, E2E_METALOOP_SETUP_TOKEN);
    await insertSetupToken(E2E_A11Y_USER.id, E2E_A11Y_SETUP_TOKEN);
    await insertSetupToken(E2E_SMOKE_USER.id, E2E_SMOKE_SETUP_TOKEN);
  } finally {
    await client.end();
  }
}

/**
 * Insert a single hero so specs can target a hero (meta deck entry, game-log
 * opponent, game-plan opponent). Heroes normally come from the network card sync
 * (skipped in e2e), so this runs after `db:seed` has created the Game the hero FKs to.
 */
async function seedHero(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO "hero" (id, game_id, external_id, name, classes, talents, updated_at)
       VALUES ($1,'flesh-and-blood','e2e-hero-dorinthea',$2, ARRAY['Warrior']::text[], ARRAY[]::text[], $3)`,
      [randomUUID(), E2E_REFERENCE.heroName, new Date().toISOString()],
    );
  } finally {
    await client.end();
  }
}

/**
 * Seed a single FaB card so the `+card` composer (task descriptions, game-plan
 * bodies) and the game-logging wizard's optional card capture resolve a real search
 * result without a network card sync.
 */
async function seedCard(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO "card" (id, game_id, external_id, name, pitch, updated_at)
         VALUES ($1,'flesh-and-blood','e2e-cnc',$2,1,$3)`,
      [randomUUID(), E2E_CARD_NAME, new Date().toISOString()],
    );
  } finally {
    await client.end();
  }
}

/**
 * Seed a team deck owned by `ownerId` on the alpha team, so a journey can pick "our
 * deck" (game-logging) or open a deck to write a game-plan on it, without driving the
 * deck form. FKs to the game + the "Classic Constructed" format `db:seed` created.
 */
async function seedTeamDeck(databaseUrl: string, name: string, ownerId: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const format = await client.query<{ id: string }>(
      `SELECT id FROM "format" WHERE game_id = 'flesh-and-blood' AND name = $1 LIMIT 1`,
      [E2E_REFERENCE.formatName],
    );
    const formatId = format.rows[0]?.id;
    if (!formatId) {
      throw new Error("Expected the seeded Classic Constructed format to exist.");
    }
    await client.query(
      `INSERT INTO "deck"
         (id, team_id, name, game_id, format_id, external_url, source, owner_id,
          status, visibility, tags, notes, updated_at)
       VALUES ($1,$2,$3,'flesh-and-blood',$4,$5,'fabrary',$6,
          'testing','team', ARRAY[]::text[], '', $7)`,
      [
        randomUUID(),
        E2E_TEAMS.alpha.id,
        name,
        formatId,
        `https://fabrary.net/decks/${randomUUID()}`,
        ownerId,
        new Date().toISOString(),
      ],
    );
  } finally {
    await client.end();
  }
}

async function waitForHealth(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${API_PORT}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // API not up yet.
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error("API did not become healthy in time.");
}

export default async function globalSetup(): Promise<void> {
  // Disable the Testcontainers reaper: this process exits after setup, and Ryuk
  // would otherwise tear the database down mid-test. global-teardown removes it.
  process.env["TESTCONTAINERS_RYUK_DISABLED"] = "true";

  const container = await new PostgreSqlContainer("postgres:17-alpine").start();
  const databaseUrl = container.getConnectionUri();

  execFileSync("pnpm", ["--filter", "@teambrewer/api", "db:deploy"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
  await seed(databaseUrl);

  // Build the API (and shared) so we can run the compiled server.
  execFileSync("pnpm", ["--filter", "@teambrewer/shared", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  execFileSync("pnpm", ["--filter", "@teambrewer/api", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  // Seed the network-free reference catalog (games + formats) so decks can be
  // created against a real format and game (Deck.gameId/formatId are FKs).
  execFileSync("pnpm", ["--filter", "@teambrewer/api", "db:seed"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  // A hero (FKs to the game the seed just created) and a card for `+card`/capture.
  await seedHero(databaseUrl);
  await seedCard(databaseUrl);

  // Team decks for the game-logging and game-plans journeys.
  await seedTeamDeck(databaseUrl, E2E_GAMELOG_DECK_NAME, E2E_GAMELOG_USER.id);
  await seedTeamDeck(databaseUrl, E2E_GAMEPLAN_DECK_NAME, E2E_GAMEPLAN_USER.id);

  const apiProcess = spawn(process.execPath, ["dist/main.js"], {
    cwd: apiDir,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      API_PORT: String(API_PORT),
      WEB_ORIGIN: "http://localhost:5173",
      BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: `http://localhost:${API_PORT}`,
      NODE_ENV: "test",
      // Every journey runs in parallel against this one API from 127.0.0.1, so
      // they share a rate-limit bucket. Raise the limits far above any single
      // run so the security throttles never cause cross-journey flakiness (the
      // limits themselves are unit/integration-tested elsewhere).
      RATE_LIMIT_DEFAULT_LIMIT: "1000000",
      RATE_LIMIT_STRICT_LIMIT: "1000000",
      RATE_LIMIT_EXPENSIVE_LIMIT: "1000000",
      RATE_LIMIT_AUTH_MAX: "1000000",
      RATE_LIMIT_AUTH_SIGN_IN_MAX: "1000000",
      // Disable Better Auth's limiter here: it applies built-in strict per-path
      // limits (e.g. /two-factor/*) that every parallel journey would blow past
      // from the shared 127.0.0.1. Per-IP limiting is exercised by the API's own
      // integration test instead.
      RATE_LIMIT_AUTH_ENABLED: "false",
    },
  });
  apiProcess.unref();

  await waitForHealth(60_000);

  writeFileSync(
    resolve(import.meta.dirname, RUNTIME_FILE),
    JSON.stringify({ containerId: container.getId(), apiPid: apiProcess.pid }),
  );
}
