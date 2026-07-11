import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor, username } from "better-auth/plugins";

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

  return betterAuth({
    secret,
    baseURL: process.env["BETTER_AUTH_URL"] ?? "http://localhost:3000",
    database: prismaAdapter(prisma, { provider: "postgresql" }),
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
    // TOTP is mandatory for password accounts; backup codes live in the
    // two_factor table. `username` gives username-based login (no email UX).
    plugins: [twoFactor(), username()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
