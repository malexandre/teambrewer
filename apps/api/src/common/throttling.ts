import { Throttle, type ThrottlerModuleOptions } from "@nestjs/throttler";

/**
 * Rate limiting (security.md). A generous global default protects every endpoint
 * from abuse; sensitive auth/link endpoints override it with a strict limit.
 *
 * Better Auth's own handlers (`/api/auth/*`, incl. login and TOTP) are mounted on
 * Express before the Nest pipeline, so this guard does not see them — Better Auth
 * applies its own rate limiting there.
 */
export const THROTTLER_OPTIONS: ThrottlerModuleOptions = [
  { name: "default", ttl: 60_000, limit: 300 },
];

const STRICT_LIMIT = 20;
const STRICT_WINDOW_MS = 60_000;

/**
 * Tighten a sensitive route (link generation, link consumption, Discord OAuth
 * start) to a strict per-client limit, overriding the global default.
 */
export const StrictRateLimit = (): MethodDecorator & ClassDecorator =>
  Throttle({ default: { limit: STRICT_LIMIT, ttl: STRICT_WINDOW_MS } });
