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
  E2E_ONBOARDING_USER,
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
    await insertSetupToken(E2E_COLLAB_AUTHOR.id, E2E_COLLAB_AUTHOR_SETUP_TOKEN);
    await insertSetupToken(E2E_COLLAB_MENTIONED.id, E2E_COLLAB_MENTIONED_SETUP_TOKEN);
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
