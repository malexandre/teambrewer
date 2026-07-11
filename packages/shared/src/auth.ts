import { z } from "zod";

/**
 * Shared auth contracts (see accounts-and-auth.md, security.md). Each account
 * uses exactly one login method; TOTP is mandatory for password accounts, and
 * accounts are invite-only (no open signup). These schemas are the single source
 * of truth validated by the API and inferred by the web app.
 */

/** The login method an account uses; exactly one, chosen at provisioning. */
export const authMethodSchema = z.enum(["password_totp", "discord"]);
export type AuthMethod = z.infer<typeof authMethodSchema>;

/**
 * Username used to log in (there is no email — see ADR-0003). Kept URL- and
 * mention-friendly; the human-facing label is `displayName`.
 */
export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be at most 32 characters")
  .regex(/^[a-zA-Z0-9._-]+$/, "Username may contain only letters, numbers, and . _ -");

export const displayNameSchema = z
  .string()
  .min(1, "Display name is required")
  .max(100, "Display name must be at most 100 characters");

/**
 * Password policy validated at the boundary. Must match the Better Auth
 * `minPasswordLength`/`maxPasswordLength` configured in the API so the two never
 * disagree.
 */
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters");

/** A 6-digit TOTP code from an authenticator app. */
export const totpCodeSchema = z
  .string()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app");

/** A one-time backup code used when the authenticator device is unavailable. */
export const backupCodeSchema = z.string().min(1, "Enter a backup code").max(64);

/** Credentials for the first step of a password-account login. */
export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Second-step verification for a password-account login. */
export const totpVerifySchema = z.object({
  code: totpCodeSchema,
});
export type TotpVerifyInput = z.infer<typeof totpVerifySchema>;

/** Body for consuming a setup link: the new user sets their password. */
export const setupPasswordSchema = z.object({
  password: passwordSchema,
});
export type SetupPasswordInput = z.infer<typeof setupPasswordSchema>;

/**
 * Result of consuming a setup/reset link: the account's username, so the web app
 * can immediately sign the user in (with the password they just set) and drive
 * the TOTP step. No secret is returned — the link's bearer is the account owner.
 */
export const onboardingResultSchema = z.object({
  username: usernameSchema,
});
export type OnboardingResult = z.infer<typeof onboardingResultSchema>;

/** Body for consuming a reset link: the user sets a new password (TOTP unaffected). */
export const resetPasswordSchema = z.object({
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Self-service password change for an authenticated password account. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Per-team role. Instance-admin is a separate global flag on the user, not a
 * team role — see teams-and-membership.md.
 */
export const teamRoleSchema = z.enum(["team_admin", "member"]);
export type TeamRole = z.infer<typeof teamRoleSchema>;

/**
 * Admin create-user payload. The target team comes from the verified `:teamId`
 * path parameter (admin routes are path-scoped — see phase-01 "Option C"), never
 * the body; `role` is the membership role granted in that team. Returns the user
 * and a setup link (password accounts) or a Discord claim link (Discord accounts).
 */
export const adminCreateUserSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  authMethod: authMethodSchema,
  role: teamRoleSchema,
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

/** A user as seen by an admin managing accounts. */
export const adminUserSummarySchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: displayNameSchema,
  authMethod: authMethodSchema,
  isInstanceAdmin: z.boolean(),
  discordUsername: z.string().nullable(),
});
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

/** Body for setting/clearing a user's global instance-admin flag (instance-admin only). */
export const setInstanceAdminSchema = z.object({
  isInstanceAdmin: z.boolean(),
});
export type SetInstanceAdminInput = z.infer<typeof setInstanceAdminSchema>;

/**
 * Response returned after an admin generates a setup/reset/claim link. The raw
 * token appears only here (it is stored hashed); the admin copies the URL and
 * shares it manually.
 */
export const generatedLinkSchema = z.object({
  purpose: z.enum(["setup", "reset", "discord_link"]),
  url: z.string(),
  expiresAt: z.string(),
});
export type GeneratedLink = z.infer<typeof generatedLinkSchema>;

/** Response for `POST /api/admin/teams/:teamId/users`: the new user and its link. */
export const adminCreateUserResponseSchema = z.object({
  user: adminUserSummarySchema,
  link: generatedLinkSchema,
});
export type AdminCreateUserResponse = z.infer<typeof adminCreateUserResponseSchema>;

/**
 * The one-time reveal of backup codes at TOTP enrolment (or regeneration). Shown
 * once; only hashes are retained server-side.
 */
export const backupCodesRevealSchema = z.object({
  backupCodes: z.array(z.string()).min(1),
});
export type BackupCodesReveal = z.infer<typeof backupCodesRevealSchema>;

/** The authenticated user's own profile (`GET /api/me`). */
export const currentUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  isInstanceAdmin: z.boolean(),
  authMethod: authMethodSchema,
  totpEnabled: z.boolean(),
  discordUserId: z.string().nullable(),
  discordUsername: z.string().nullable(),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

/** A user's active session summary (`GET /api/me/sessions`). */
export const sessionSummarySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  isCurrent: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionListSchema = z.object({
  data: z.array(sessionSummarySchema),
});
export type SessionList = z.infer<typeof sessionListSchema>;
