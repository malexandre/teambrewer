import { Throttle, type ThrottlerModuleOptions } from "@nestjs/throttler";

import { readPositiveIntegerEnv } from "./env.js";

/**
 * Rate limiting (security.md). A generous global default protects every endpoint
 * from abuse; sensitive auth/link endpoints override it with a strict limit, and
 * expensive read/sync endpoints use a tuned middle limit.
 *
 * All thresholds are configurable via env (phase-13) with the documented defaults
 * below; see `.env.example`. Values are read at module load, i.e. once at process
 * start, which is when env is fixed for a deployment.
 *
 * Better Auth's own handlers (`/api/auth/*`, incl. login and TOTP) are mounted on
 * Express before the Nest pipeline, so this guard does not see them — Better Auth
 * applies its own rate limiting there (configured in auth.ts, also env-driven).
 */
const DEFAULT_WINDOW_MILLISECONDS = readPositiveIntegerEnv("RATE_LIMIT_DEFAULT_WINDOW_MS", 60_000);
const DEFAULT_LIMIT = readPositiveIntegerEnv("RATE_LIMIT_DEFAULT_LIMIT", 300);

const STRICT_WINDOW_MILLISECONDS = readPositiveIntegerEnv("RATE_LIMIT_STRICT_WINDOW_MS", 60_000);
const STRICT_LIMIT = readPositiveIntegerEnv("RATE_LIMIT_STRICT_LIMIT", 20);

const EXPENSIVE_WINDOW_MILLISECONDS = readPositiveIntegerEnv(
  "RATE_LIMIT_EXPENSIVE_WINDOW_MS",
  60_000,
);
const EXPENSIVE_LIMIT = readPositiveIntegerEnv("RATE_LIMIT_EXPENSIVE_LIMIT", 60);

export const THROTTLER_OPTIONS: ThrottlerModuleOptions = [
  { name: "default", ttl: DEFAULT_WINDOW_MILLISECONDS, limit: DEFAULT_LIMIT },
];

/**
 * Tighten a sensitive route (link generation, link consumption, Discord OAuth
 * start) to a strict per-client limit, overriding the global default.
 */
export const StrictRateLimit = (): MethodDecorator & ClassDecorator =>
  Throttle({ default: { limit: STRICT_LIMIT, ttl: STRICT_WINDOW_MILLISECONDS } });

/**
 * Tighten an expensive read/aggregation or sync route (matchup matrix/coverage,
 * card search, admin card-data sync) below the generous global default, so a
 * burst of costly queries can't degrade the instance for a whole team.
 */
export const ExpensiveOperationRateLimit = (): MethodDecorator & ClassDecorator =>
  Throttle({ default: { limit: EXPENSIVE_LIMIT, ttl: EXPENSIVE_WINDOW_MILLISECONDS } });
