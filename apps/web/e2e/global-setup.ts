import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";

import {
  E2E_COLLAB_AUTHOR,
  E2E_COLLAB_AUTHOR_SETUP_TOKEN,
  E2E_COLLAB_MENTIONED,
  E2E_COLLAB_MENTIONED_SETUP_TOKEN,
  E2E_DECKS_SETUP_TOKEN,
  E2E_DECKS_USER,
  E2E_EVENTS_SETUP_TOKEN,
  E2E_EVENTS_USER,
  E2E_GAMELOG_DECK_NAME,
  E2E_GAMELOG_SETUP_TOKEN,
  E2E_GAMELOG_USER,
  E2E_ONBOARDING_USER,
  E2E_REFERENCE,
  E2E_SETUP_TOKEN,
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
    async function addMembership(teamId: string, userId: string) {
      await client.query(
        `INSERT INTO "team_membership" (id, team_id, user_id, role) VALUES ($1,$2,$3,'member')`,
        [randomUUID(), teamId, userId],
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
  } finally {
    await client.end();
  }
}

/**
 * Insert a single hero so the events journey can add a hero gauntlet target.
 * Heroes normally come from the network card sync (skipped in e2e), so this runs
 * after `db:seed` has created the Game the hero FKs to.
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
 * Seed a team deck owned by the game-logging user on the alpha team, so the
 * game-logging journey can pick "our deck" without driving the (desktop-oriented)
 * deck form on a phone viewport. FKs to the game + the "Classic Constructed" format
 * the network-free `db:seed` created.
 */
async function seedGameLogDeck(databaseUrl: string): Promise<void> {
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
          status, visibility, is_reference, tags, notes, updated_at)
       VALUES ($1,$2,$3,'flesh-and-blood',$4,$5,'fabrary',$6,
          'testing','team',false, ARRAY[]::text[], '', $7)`,
      [
        randomUUID(),
        E2E_TEAMS.alpha.id,
        E2E_GAMELOG_DECK_NAME,
        formatId,
        "https://fabrary.net/decks/e2e-gamelog",
        E2E_GAMELOG_USER.id,
        new Date().toISOString(),
      ],
    );
  } finally {
    await client.end();
  }
}

/**
 * Seed a single FaB card so the game-logging wizard's optional card-capture step
 * (step 4) has something real to search for and pick, without a network card sync.
 */
async function seedGameLogCard(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO "card" (id, game_id, external_id, name, pitch, updated_at)
         VALUES ($1,'flesh-and-blood','e2e-cnc','Command and Conquer',1,$2)`,
      [randomUUID(), new Date().toISOString()],
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

  // A hero for the events journey's gauntlet (FKs to the game the seed just created).
  await seedHero(databaseUrl);

  // A team deck for the game-logging journey (FKs to the game + format from the seed).
  await seedGameLogDeck(databaseUrl);

  // A card for the game-logging journey's optional card-capture step.
  await seedGameLogCard(databaseUrl);

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
    },
  });
  apiProcess.unref();

  await waitForHealth(60_000);

  writeFileSync(
    resolve(import.meta.dirname, RUNTIME_FILE),
    JSON.stringify({ containerId: container.getId(), apiPid: apiProcess.pid }),
  );
}
