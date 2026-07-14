import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Absolute path to the monorepo's single root `.env`.
 *
 * Local dev used to load two different env files depending on the launch path:
 * `pnpm start` injects the root `.env`, but the API's own `ConfigModule` (and
 * Prisma) default to the `.env` in the process cwd — which is `apps/api/` when
 * run via `pnpm --filter api …` / `pnpm dev`. If the two drifted (different
 * `DATABASE_URL`, `BETTER_AUTH_SECRET`, or `BETTER_AUTH_URL`), auth broke in
 * confusing ways (wrong DB → "incorrect password"; rotated secret → logouts +
 * undecryptable TOTP). Resolving the ONE root `.env` here removes that drift.
 *
 * The workspace root (the directory holding `pnpm-workspace.yaml`) is always an
 * ancestor of whatever cwd these commands run from — repo root under `pnpm start`,
 * `apps/api/` under `pnpm dev`/`pnpm --filter api …` — so walk up from cwd to find
 * it. Cwd-based (not module-relative) so it is identical under CommonJS and ESM.
 */
export function resolveRootEnvPath(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return join(dir, ".env");
    }
    const parent = dirname(dir);
    if (parent === dir) {
      // Reached the filesystem root without finding the marker; fall back to cwd.
      return join(process.cwd(), ".env");
    }
    dir = parent;
  }
}
