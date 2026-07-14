import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor, username } from "better-auth/plugins";

import { readPositiveIntegerEnv } from "../common/env.js";
import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Password policy — must match `passwordSchema` in `@teambrewer/shared`.
 */
export const MINIMUM_PASSWORD_LENGTH = 12;
export const MAXIMUM_PASSWORD_LENGTH = 128;

/**
 * Builds the Better Auth instance. TeamBrewer uses Better Auth only for auth
 * primitives — password hashing + credential accounts, secure session cookies,
 * mandatory TOTP + backup codes, and (phase-04) the Discord provider. It does
 * **not** use Better Auth's organization plugin; teams are a custom model
 * (see docs/architecture/multi-tenancy.md).
 *
 * Open sign-up is disabled (invite-only). Accounts are provisioned server-side
 * through the internal adapter, and there is no email server (ADR-0003), so the
 * `email` column holds a synthetic non-routable value and login is by username.
 */
export function createAuth(prisma: PrismaClient) {
  const secret = process.env["BETTER_AUTH_SECRET"];
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is not set; cannot start authentication.");
  }

  const discordClientId = process.env["DISCORD_CLIENT_ID"];
  const discordClientSecret = process.env["DISCORD_CLIENT_SECRET"];
  const discordRedirectUri = process.env["DISCORD_REDIRECT_URI"];

  // The browser talks to the app at WEB_ORIGIN (e.g. the Vite dev server on
  // :5173, or the deployed web origin) and calls the auth endpoints from there.
  // Better Auth runs its OWN origin check (separate from Express CORS in main.ts)
  // and by default only trusts BETTER_AUTH_URL's origin — so if BETTER_AUTH_URL is
  // the API's own URL (e.g. :3000) rather than the web origin, sign-in from the
  // web app is rejected with "Invalid origin". Trust WEB_ORIGIN explicitly (the
  // same origin CORS already allows) so auth works regardless of BETTER_AUTH_URL.
  // Comma-separated values are supported for multi-origin deployments.
  const trustedOrigins = (process.env["WEB_ORIGIN"] ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Rate limiting for the auth surface (security.md, phase-13). Better Auth's
  // handlers are mounted outside the Nest pipeline, so the Nest throttler never
  // sees them — Better Auth applies its own limiter, enabled here (it is off by
  // default outside production) and env-configurable. A generous global auth
  // limit plus a strict per-window cap on the sign-in paths (username + email)
  // blunts credential brute-forcing. Windows are in seconds (Better Auth's unit).
  const authWindowSeconds = readPositiveIntegerEnv("RATE_LIMIT_AUTH_WINDOW_SECONDS", 60);
  const authMaxRequests = readPositiveIntegerEnv("RATE_LIMIT_AUTH_MAX", 300);
  const signInWindowSeconds = readPositiveIntegerEnv("RATE_LIMIT_AUTH_SIGN_IN_WINDOW_SECONDS", 60);
  const signInMaxRequests = readPositiveIntegerEnv("RATE_LIMIT_AUTH_SIGN_IN_MAX", 10);
  const signInRule = { window: signInWindowSeconds, max: signInMaxRequests };
  // Enabling Better Auth's limiter also turns on its built-in strict per-path
  // defaults (e.g. /two-factor/*). That protects production (per real client IP),
  // but breaks the e2e suite where every parallel journey shares 127.0.0.1 — so
  // it is disabled there via RATE_LIMIT_AUTH_ENABLED=false. Defaults to on.
  const rateLimitEnabled = process.env["RATE_LIMIT_AUTH_ENABLED"] !== "false";

  return betterAuth({
    secret,
    baseURL: process.env["BETTER_AUTH_URL"] ?? "http://localhost:3000",
    trustedOrigins,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    rateLimit: {
      enabled: rateLimitEnabled,
      window: authWindowSeconds,
      max: authMaxRequests,
      storage: "memory",
      customRules: {
        "/sign-in/username": signInRule,
        "/sign-in/email": signInRule,
      },
    },
    emailAndPassword: {
      enabled: true,
      // Invite-only: no public sign-up. Accounts are admin-provisioned.
      disableSignUp: true,
      minPasswordLength: MINIMUM_PASSWORD_LENGTH,
      maxPasswordLength: MAXIMUM_PASSWORD_LENGTH,
      // No email server (ADR-0003); nothing to verify against.
      requireEmailVerification: false,
    },
    user: {
      additionalFields: {
        // Set server-side during provisioning; never client-supplied.
        displayName: { type: "string", required: false, input: false },
        isInstanceAdmin: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
        authMethod: {
          type: "string",
          required: false,
          defaultValue: "password_totp",
          input: false,
        },
        discordUserId: { type: "string", required: false, input: false },
        discordUsername: { type: "string", required: false, input: false },
      },
    },
    // Discord SSO (ADR-0009). Only configured when credentials are present.
    // `disableImplicitSignUp` preserves invite-only (no auto-provisioning); we
    // request ONLY the `identify` scope (no email), overriding the defaults.
    ...(discordClientId && discordClientSecret
      ? {
          socialProviders: {
            discord: {
              clientId: discordClientId,
              clientSecret: discordClientSecret,
              scope: ["identify"],
              disableDefaultScope: true,
              disableImplicitSignUp: true,
              ...(discordRedirectUri ? { redirectURI: discordRedirectUri } : {}),
            },
          },
        }
      : {}),
    // TOTP is mandatory for password accounts; backup codes live in the
    // two_factor table. `username` gives username-based login (no email UX).
    plugins: [twoFactor(), username()],
  });
}

/** True when Discord SSO credentials are configured (see .env.example). */
export function isDiscordConfigured(): boolean {
  return Boolean(process.env["DISCORD_CLIENT_ID"] && process.env["DISCORD_CLIENT_SECRET"]);
}

export type Auth = ReturnType<typeof createAuth>;
