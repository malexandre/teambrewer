#!/usr/bin/env node
// @ts-check
/**
 * `pnpm start` — one command to run TeamBrewer locally for manual testing.
 *
 * Sequences: resolve/generate ./.env → start a local Postgres in Docker (persisted
 * to a gitignored bind mount) → build → migrate → seed reference data → sync cards
 * (first run only) → bootstrap the instance-admin → print the setup link → run the
 * web + api dev servers with hot reload.
 *
 * Config is passed to every child process explicitly via its environment, so it is
 * authoritative regardless of what apps/api/.env contains (dotenv / @nestjs/config
 * do not override variables already present in the environment). See
 * docs/ops/local-development.md.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(repoRoot, ".env");
const dockerDataDir = join(repoRoot, ".docker-data");
const cardsSyncedMarker = join(dockerDataDir, ".cards-synced");
const lastLinkPath = join(dockerDataDir, "last-setup-link.txt");
const composeFile = join(repoRoot, "docker-compose.dev.yml");
const DB_CONTAINER = "teambrewer-dev-db";

const ESC = "";
const color = (code, text) => `${ESC}[${code}m${text}${ESC}[0m`;
const bold = (text) => color("1", text);
const dim = (text) => color("2", text);

function fail(message) {
  console.error(`\n${color("31", `✖ ${message}`)}`);
  process.exit(1);
}

function step(message) {
  console.log(`\n${bold(`▶ ${message}`)}`);
}

/** Parse a minimal KEY=VALUE .env file (comments, blanks, and quotes handled). */
function parseEnvFile(contents) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

/**
 * Resolve config with precedence: real shell environment > ./.env file > defaults.
 * Creates ./.env from a template (with a freshly generated, persisted
 * BETTER_AUTH_SECRET) when it does not yet exist — and, when ./.env exists but is
 * missing BETTER_AUTH_SECRET, persists a generated one to it rather than using an
 * ephemeral per-run value (a rotating secret logs everyone out and breaks TOTP 2FA).
 */
function resolveConfig() {
  const fileValues = existsSync(envPath) ? parseEnvFile(readFileSync(envPath, "utf8")) : {};
  const pick = (key, fallback) => process.env[key] ?? fileValues[key] ?? fallback;

  const devDatabasePort = pick("DEV_DB_PORT", "5434");
  const postgresPassword = pick("POSTGRES_PASSWORD", "teambrewer");
  const databaseUrl = pick(
    "DATABASE_URL",
    `postgresql://teambrewer:${postgresPassword}@localhost:${devDatabasePort}/teambrewer`,
  );
  const webOrigin = pick("WEB_ORIGIN", "http://localhost:5173");

  let betterAuthSecret = process.env["BETTER_AUTH_SECRET"] ?? fileValues["BETTER_AUTH_SECRET"];
  let generatedSecret = false;
  if (!betterAuthSecret) {
    betterAuthSecret = randomBytes(32).toString("base64");
    generatedSecret = true;
  }

  const config = {
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: betterAuthSecret,
    BETTER_AUTH_URL: pick("BETTER_AUTH_URL", webOrigin),
    WEB_ORIGIN: webOrigin,
    API_PORT: pick("API_PORT", "3000"),
    DEV_DB_PORT: devDatabasePort,
    POSTGRES_PASSWORD: postgresPassword,
    SEED_ADMIN_USERNAME: pick("SEED_ADMIN_USERNAME", "admin"),
    SEED_ADMIN_DISPLAY_NAME: pick("SEED_ADMIN_DISPLAY_NAME", "Local Admin"),
  };

  if (!existsSync(envPath)) {
    writeFileSync(envPath, renderEnvTemplate(config), "utf8");
    console.log(`Created ${dim(".env")} with local-dev defaults (generated BETTER_AUTH_SECRET).`);
  } else if (generatedSecret) {
    // .env exists but has no secret. Persist the generated one instead of using
    // an ephemeral per-run value — otherwise the secret rotates on every restart,
    // which invalidates every session (surprise logouts) and, worse, renders the
    // encrypted-at-rest TOTP secrets undecryptable so 2FA accounts can never sign
    // back in. Append so any other keys the user set in .env are preserved.
    appendFileSync(
      envPath,
      `\n# Added automatically so sessions + TOTP 2FA survive restarts. Keep it stable.\nBETTER_AUTH_SECRET=${betterAuthSecret}\n`,
      "utf8",
    );
    console.log(
      `Added a generated ${dim("BETTER_AUTH_SECRET")} to ${dim(".env")} ` +
        "(kept stable so sessions and 2FA survive restarts).",
    );
  }

  // `config` is the resolved subset the orchestrator itself needs; `fileValues`
  // is the full ./.env so anything else the user set there (DISCORD_*, RATE_LIMIT_*,
  // …) also reaches the child processes.
  return { config, fileValues };
}

function renderEnvTemplate(config) {
  return `# TeamBrewer local development — used by \`pnpm start\` (scripts/start-local.mjs).
# Gitignored. Edit SEED_ADMIN_* to change the bootstrapped instance-admin identity.
# The Docker Compose production stack (docker-compose.yml) uses some different values.

# Local Postgres (Docker) — 5432/5433 are often taken, so dev uses 5434.
DEV_DB_PORT=${config.DEV_DB_PORT}
POSTGRES_PASSWORD=${config.POSTGRES_PASSWORD}
DATABASE_URL=${config.DATABASE_URL}

# The dev web app (Vite) runs on 5173 and proxies /api to the API on 3000.
WEB_ORIGIN=${config.WEB_ORIGIN}
BETTER_AUTH_URL=${config.BETTER_AUTH_URL}
API_PORT=${config.API_PORT}

# Better Auth signing secret. Generated once; keep it stable so sessions survive.
BETTER_AUTH_SECRET=${config.BETTER_AUTH_SECRET}

# The instance-admin bootstrapped on \`pnpm start\` (no password — a setup link is printed).
SEED_ADMIN_USERNAME=${config.SEED_ADMIN_USERNAME}
SEED_ADMIN_DISPLAY_NAME=${config.SEED_ADMIN_DISPLAY_NAME}
`;
}

/** Run a command inheriting stdio; abort the whole script on failure. */
function run(command, args, env, failureMessage) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit", env });
  if (result.error && /** @type {NodeJS.ErrnoException} */ (result.error).code === "ENOENT") {
    fail(`\`${command}\` was not found on PATH. ${failureMessage ?? ""}`.trim());
  }
  if (result.status !== 0) {
    fail(failureMessage ?? `\`${command} ${args.join(" ")}\` failed.`);
  }
}

/** Run a command capturing stdout; abort on failure. Returns the captured stdout. */
function capture(command, args, env, failureMessage) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env,
    stdio: ["inherit", "pipe", "inherit"],
  });
  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    fail(failureMessage ?? `\`${command} ${args.join(" ")}\` failed.`);
  }
  return result.stdout ?? "";
}

function assertDockerAvailable(env) {
  const result = spawnSync("docker", ["info"], { cwd: repoRoot, env, stdio: "ignore" });
  if (result.error || result.status !== 0) {
    fail("Docker does not appear to be running. Start Docker Desktop and try again.");
  }
}

async function waitForDatabaseHealthy(env) {
  const timeoutMs = 60_000;
  const startedAt = Date.now();
  for (;;) {
    const result = spawnSync(
      "docker",
      ["inspect", "--format", "{{.State.Health.Status}}", DB_CONTAINER],
      { cwd: repoRoot, encoding: "utf8", env },
    );
    const status = (result.stdout ?? "").trim();
    if (status === "healthy") {
      return;
    }
    if (Date.now() - startedAt > timeoutMs) {
      fail(
        `Postgres did not become healthy within ${timeoutMs / 1000}s (last status: "${status}").`,
      );
    }
    await sleep(1500);
  }
}

function printSetupBanner(config, bootstrapOutput) {
  const link = bootstrapOutput.match(/^SETUP_LINK=(.+)$/m)?.[1]?.trim();
  const rule = "═".repeat(66);
  console.log(`\n${color("36", rule)}`);
  if (link) {
    mkdirSync(dockerDataDir, { recursive: true });
    writeFileSync(lastLinkPath, `${link}\n`, "utf8");
    console.log(bold("  Open this link to set your password and enable 2FA (TOTP):"));
    console.log(`\n  ${color("1;32", link)}\n`);
    console.log(dim(`  Sign in as "${config.SEED_ADMIN_USERNAME}". Link also saved to`));
    console.log(dim(`  ${lastLinkPath}`));
  } else {
    console.log(bold(`  Instance-admin "${config.SEED_ADMIN_USERNAME}" is already set up.`));
    console.log(`  Sign in at ${color("1;32", config.WEB_ORIGIN)}`);
  }
  console.log(color("36", rule));
  console.log(dim("\n  Starting the web + api dev servers… (Ctrl-C to stop)\n"));
}

async function main() {
  const { config, fileValues } = resolveConfig();
  // Precedence: ./.env values < real shell environment < the resolved config.
  const childEnv = { ...fileValues, ...process.env, ...config };

  step("Starting the local Postgres (Docker)");
  assertDockerAvailable(childEnv);
  run(
    "docker",
    ["compose", "-f", composeFile, "up", "-d"],
    childEnv,
    "Failed to start the Postgres container.",
  );
  await waitForDatabaseHealthy(childEnv);
  console.log("Postgres is healthy.");

  step("Building the API (needed for seed / bootstrap)");
  run("pnpm", ["--filter", "@teambrewer/api", "db:generate"], childEnv);
  run("pnpm", ["--filter", "@teambrewer/shared", "build"], childEnv);
  run("pnpm", ["--filter", "@teambrewer/api", "build"], childEnv);

  step("Applying database migrations");
  run("pnpm", ["--filter", "@teambrewer/api", "db:deploy"], childEnv);

  step("Seeding reference data (games + formats)");
  run("pnpm", ["--filter", "@teambrewer/api", "db:seed"], childEnv);

  const forceCardSync = ["1", "true", "yes"].includes(
    (process.env["FORCE_CARD_SYNC"] ?? "").toLowerCase(),
  );
  if (forceCardSync || !existsSync(cardsSyncedMarker)) {
    step("Syncing card data (first run — this downloads the card database)");
    run("pnpm", ["--filter", "@teambrewer/api", "card:sync"], childEnv);
    mkdirSync(dockerDataDir, { recursive: true });
    writeFileSync(cardsSyncedMarker, "synced\n", "utf8");
  } else {
    console.log(`\n${dim("Cards already synced — skipping (set FORCE_CARD_SYNC=1 to re-sync).")}`);
  }

  step("Bootstrapping the instance-admin");
  const bootstrapOutput = capture(
    "pnpm",
    ["--filter", "@teambrewer/api", "--silent", "bootstrap:local"],
    childEnv,
    "Failed to bootstrap the instance-admin.",
  );
  process.stdout.write(`${bootstrapOutput.replace(/^SETUP_LINK=.*$/m, "").trimEnd()}\n`);

  printSetupBanner(config, bootstrapOutput);

  // Hand off to the dev servers (long-running, foreground). Ctrl-C stops them; the
  // detached Postgres container keeps running (data persists in the bind mount).
  const dev = spawnSync("pnpm", ["dev"], { cwd: repoRoot, stdio: "inherit", env: childEnv });
  process.exit(dev.status ?? 0);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
