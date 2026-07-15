# ADR-0009: Discord as an alternative authentication method

- **Status:** Accepted (2026-07-11); **partially superseded by [ADR-0011](0011-discord-additional-login-method.md) (2026-07-15)** — password accounts may now add Discord as an *additional* login method (previously identity-only).
- **Context:** The team lives on Discord. The user wants Discord to be usable for signing in, and asked
  what the tradeoffs/requirements are. This interacts with [ADR-0003](0003-no-email-auth.md) (invite-only,
  no email, mandatory TOTP 2FA). After weighing the tradeoffs, the user chose to support **Discord SSO as
  an alternative login method**, with each account using **exactly one** login method.

## Decision

- **Two login methods; each account uses exactly one:**
  1. **Password + TOTP 2FA** (+ backup codes) — TOTP is **mandatory** for these accounts (per ADR-0003).
  2. **Discord SSO** — sign in with Discord (OAuth2, `identify` scope only).
- **Each account uses exactly one method, and the _invitee_ chooses it at claim time.** The admin no
  longer picks the method when creating the account (superseded 2026-07 — the admin found forcing the
  choice upfront awkward). Instead the admin creates the account and shares **one method-agnostic invite
  link**; the claim page offers *"set a password + TOTP"* or *"continue with Discord."* Whichever the
  invitee completes **commits** that account's method — an account that has set a password can no longer be
  claimed with Discord, and vice-versa (mutual exclusivity, now enforced at claim rather than creation).
  Changing an account's method afterwards remains an **admin-assisted** action.
- **Invite-only is preserved.** Discord login only works for an account an **admin has provisioned**.
  There is **no auto-provisioning**: a Discord user with no matching, admin-created account is rejected.
  The unified invite link binds the user's Discord identity (and commits the method) on first authorization;
  a legacy single-use **Discord claim link** is still accepted for the same binding.
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
- **Allowing both methods on one account** — originally rejected for simplicity; **reversed for the
  password → Discord direction by [ADR-0011](0011-discord-additional-login-method.md).**
