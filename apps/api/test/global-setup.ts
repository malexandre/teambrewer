import { execFileSync } from "node:child_process";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { ProvidedContext } from "vitest";

// Vitest 4 does not export a named type for the global-setup context, so type
// the slice we use. `provide` publishes values to tests via inject().
interface GlobalSetupContext {
  provide<Key extends keyof ProvidedContext>(key: Key, value: ProvidedContext[Key]): void;
}

let container: StartedPostgreSqlContainer | undefined;

export async function setup({ provide }: GlobalSetupContext): Promise<void> {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  const databaseUrl = container.getConnectionUri();

  // Apply the committed migrations to the fresh database so integration tests
  // run against the real schema. The API package is the cwd when its test
  // script runs, and prisma.config.ts reads DATABASE_URL from the environment.
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  process.env.DATABASE_URL = databaseUrl;
  provide("databaseUrl", databaseUrl);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
