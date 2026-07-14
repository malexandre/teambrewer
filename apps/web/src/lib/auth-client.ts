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
    // No `twoFactorPage`/`onTwoFactorRedirect`: a 2FA-required sign-in resolves
    // with `{ twoFactorRedirect: true }`, which LoginPage reads to switch to the
    // TOTP step in place. Setting `twoFactorPage` makes better-auth do a hard
    // `window.location.href` redirect — that reloads the SPA mid-request, aborts
    // the sign-in call, and drops the user back on an empty login form (the code
    // field never shows). Handling it in-page is the whole point.
    twoFactorClient(),
  ],
});
