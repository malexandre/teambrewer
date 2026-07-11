import { createAuthClient } from "better-auth/client";
import { twoFactorClient, usernameClient } from "better-auth/client/plugins";

/**
 * Better Auth browser client. Mirrors the server plugins (username + twoFactor)
 * so the web app drives password login, mandatory TOTP enrolment/verification,
 * and backup codes through Better Auth's own endpoints (mounted at /api/auth).
 * Same-origin in dev (Vite proxies /api) and in production (Nginx), so the
 * default baseURL (current origin) is correct.
 */
export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    twoFactorClient({
      // A 2FA-enabled login lands here; the login page reads this to show the
      // TOTP step rather than doing a hard redirect.
      twoFactorPage: "/login",
    }),
  ],
});
