# ADR-0009: Discord as an alternative authentication method

- **Status:** Accepted (2026-07-11)
- **Context:** The team lives on Discord. The user wants Discord to be usable for signing in, and asked
  what the tradeoffs/requirements are. This interacts with [ADR-0003](0003-no-email-auth.md) (invite-only,
  no email, mandatory TOTP 2FA). After weighing the tradeoffs, the user chose to support **Discord SSO as
  an alternative login method**, with each account using **exactly one** login method.

## Decision

- **Two login methods; each account uses exactly one:**
  1. **Password + TOTP 2FA** (+ backup codes) — TOTP is **mandatory** for these accounts (per ADR-0003).
  2. **Discord SSO** — sign in with Discord (OAuth2, `identify` scope only).
- **A user picks one method; they are mutually exclusive for login.** A password account is not also a
  Discord-login account, and vice-versa. Switching an account's method is an **admin-assisted** action.
- **Invite-only is preserved.** Discord login only works for an account an **admin has provisioned**.
  There is **no auto-provisioning**: a Discord user with no matching, admin-created account is rejected.
  An admin either pre-binds the user's Discord ID or issues a single-use **Discord claim link** (no email,
  shared manually like setup links) that binds the user's Discord identity on first authorization.
- **Optional identity link for password accounts:** a password+TOTP user MAY link a Discord account for
  **identity only** (recognizability, @mention mapping). This does **not** enable Discord login.
- **Minimal data & standard hardening:** request only the `identify` scope (Discord user ID + username;
  **not** `email`). Use the OAuth2 `state` parameter (CSRF). Store only `discordUserId` + `discordUsername`.

## The accepted tradeoff (recorded explicitly)

For **Discord-login accounts, two-factor security is delegated to Discord** — we cannot enforce that the
user has Discord 2FA enabled, and compromise of their Discord account compromises their TeamBrewer access.
This is a **known, accepted** weakening of the "we enforce TOTP" guarantee, chosen for convenience. To
mitigate: restrict Discord login to provisioned accounts, request minimal scope, and **surface a clear
recommendation** to enable Discord 2FA. Teams/admins who want the strongest guarantee should provision
password + TOTP accounts instead.

## Requirements & operational notes

- Register a **Discord application** (Developer Portal) → `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and
  a configured **redirect URI**. These are secrets/config (env / Docker secrets); the app now has an
  external dependency on Discord for those accounts' logins.
- No special Discord "app verification" is needed at our scale (that applies to bots in 100+ guilds).
- Better Auth supports Discord as a social provider; use it rather than hand-rolling OAuth.

## Consequences

- Convenient login for a Discord-native team; invite-only and the no-email model are preserved.
- Auth model gains an `authMethod` per account and Discord identity fields (see
  [data-model](../architecture/data-model.md)).
- The "mandatory TOTP for everyone" statement in [ADR-0003](0003-no-email-auth.md) is refined to
  "mandatory for **password** accounts."
- Slightly more surface to build and test (OAuth flow, provisioning/claim, method exclusivity).

## Alternatives considered

- **No Discord (password + TOTP only)** — most secure/simplest; rejected in favor of the convenience the
  user wants.
- **Discord bot delivering setup/reset links** — not selected now (adds bot infra); may revisit.
- **Allowing both methods on one account** — rejected: the user wants a single login method per account
  to keep it unambiguous.
