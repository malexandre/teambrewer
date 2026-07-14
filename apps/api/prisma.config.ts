import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Load the monorepo's single root .env (walk up from cwd to the workspace root
// that holds pnpm-workspace.yaml), NOT the cwd-relative one. This keeps Prisma's
// DATABASE_URL in lockstep with the API's ConfigModule (see src/common/root-env.ts)
// regardless of the directory the Prisma CLI is invoked from, so the two never drift.
function resolveRootEnvPath(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return join(dir, ".env");
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return join(process.cwd(), ".env");
    }
    dir = parent;
  }
}

loadEnv({ path: resolveRootEnvPath() });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
