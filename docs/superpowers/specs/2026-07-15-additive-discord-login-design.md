# Design: additive Discord login for password accounts

- **Date:** 2026-07-15
- **Status:** Proposed (awaiting review)
- **Supersedes (in part):** [ADR-0009](../../decisions/0009-discord-authentication.md) — the "each account
  uses exactly one login method" rule, for the password → Discord direction only.

## Problem

A password + TOTP account can link a Discord identity from Settings, but that link is **identity-only**
(for recognizability and `@mention` mapping). Using "Log in with Discord" afterwards bounces back to the
login page. The product owner wants the opposite: **once I link Discord, I can sign in with either my
password (+ TOTP) or Discord — my choice.**

### Why it currently bounces (root cause)

Discord login is Better Auth's native social flow (`/api/auth/callback/discord`), gated by:

1. the **`account` table** — a row with `providerId="discord"`, `accountId=<discordUserId>` resolves the
   login to that row's `userId`; and
2. **`disableImplicitSignUp: true`** on the Discord social provider (`apps/api/src/auth/auth.ts`) — no
   auto-provisioning of unknown Discord identities.

`linkIdentityOnly` (`apps/api/src/auth/discord-account.service.ts`) writes only `user.discordUserId` /
`user.discordUsername` and **never creates the `discord` account row**. With no row, Better Auth finds no
linked account and (correctly, for invite-only) refuses to create one → bounce to `/login`.

## Decisions (confirmed with the product owner)

1. **Security tradeoff — accepted as-is.** The Discord login path is **not** protected by the account's
   mandatory TOTP (2FA is delegated to Discord). Anyone controlling the linked Discord account can sign in
   without the TOTP code. This is the exact tradeoff ADR-0009 recorded; the owner accepts it for
   convenience. Mitigation: surface a clear "enable Discord 2FA" recommendation in Settings.
2. **Scope — password → add Discord only.** A password + TOTP account may add Discord as an *additional*
   login method. Discord-login accounts are unchanged (they cannot add a password here). Fully symmetric
   both-ways support is **out of scope**.
3. **Linking = identity + login (one action).** Connecting Discord immediately makes it usable for login;
   there is no separate "enable login" toggle. Unlinking removes both the identity and Discord login.

## Approach (chosen: A — the `account` table is the source of truth)

Login capability is modeled by the presence of `account` rows, exactly as Better Auth already does. A
password account that links Discord ends up as **one `user`** with **two `account` rows**
(`providerId="credential"` for the password, `providerId="discord"` for Discord login), both pointing at
the same `user.id`. This is standard account-linking — **not** a second user. **No schema (DDL) change;
one data migration** is required for existing links (see change 6).

`authMethod` keeps its current meaning ("how the account was claimed / its primary method") and is **not**
changed by linking; it is no longer the arbiter of login capability.

Rejected alternatives: (B) a `user.discordLoginEnabled` flag — redundant with the account row and needs
sync; (C) making `authMethod` multi-valued — invasive and fights Better Auth's model.

## Detailed changes

### 1. `linkIdentityOnly` — also create the Discord `account` row

File: `apps/api/src/auth/discord-account.service.ts`.

Inside the existing transaction, after the current guards (`authMethod === "password_totp"`, and the
`discordUserId`-already-in-use conflict check), in addition to updating the user's
`discordUserId`/`discordUsername`:

- Find this user's existing `account` row where `providerId="discord"`.
  - **None:** create one — `{ id: randomUUID(), userId, providerId: "discord", accountId: discordUserId }`
    (mirrors `bindLoginIdentity`; `createdAt`/`updatedAt` come from Prisma defaults).
  - **Exists, different `accountId`:** update `accountId` to the new `discordUserId` (re-link to a
    different Discord identity).
  - **Exists, same `accountId`:** no-op (idempotent re-link).

Guards unchanged: still password-accounts-only; still rejects a `discordUserId` already bound to another
user (`user.discordUserId` is `@unique`, and the conflict check stays).

### 2. Login flow — no code change

Once the `discord` account row exists, Better Auth's `/api/auth/callback/discord` resolves it to the
user. `disableImplicitSignUp: true` stays, preserving invite-only: any Discord id without a
pre-linked, provisioned account is still rejected. `LoginPage`'s "Log in with Discord" is unchanged.

### 3. `unlinkIdentity` — also delete the Discord `account` row

File: `apps/api/src/auth/discord-account.service.ts` (wired at `me.controller.ts:71`,
`DELETE /me/discord/link`). Currently nulls `user.discordUserId`/`discordUsername`. It must **also delete**
this user's `account` row with `providerId="discord"`, in one transaction, so Discord login is revoked.
The password + TOTP credential remains, so the account never loses its last login method — no lockout risk
in this scope. Guard unchanged (`authMethod === "password_totp"` only).

### 4. `resolveLoginUser` — remove the stale `authMethod` gate (cleanup)

`resolveLoginUser` checks `user.authMethod !== "discord"` and is **only referenced by tests** (not wired
into the login path). Under the new model a password account logging in via Discord has
`authMethod="password_totp"`, so that check is now semantically wrong. Since it is dead code, remove the
method (and its tests), or drop the `authMethod` condition — to prevent a future foot-gun if someone wires
it in. Decision: **remove it**, since Better Auth owns login resolution and nothing calls it.

### 5. Settings UI — copy + 2FA recommendation

File: `apps/web/src/features/account/SettingsPage.tsx` (`DiscordIdentityCard`, shown when
`authMethod === "password_totp"`).

- Description changes from "Link Discord for recognition and @mentions (not for login)." to convey that
  linking **also enables signing in with Discord**.
- When linked, show a short **recommendation to enable 2FA on the Discord account** (the accepted-tradeoff
  mitigation).
- Unlink control copy notes it also removes Discord sign-in.

No API contract change: `POST /me/discord/link` still returns `{ authorizeUrl }`; `GET /me` still returns
`discordUsername`/`authMethod`. No new shared Zod schema.

### 6. Data migration — drop existing identity-only links (force clean re-link)

Accounts linked under the **old** identity-only behavior have `user.discordUserId` set but **no** `discord`
`account` row, so they would remain unable to log in after deploy. They also linked when the UI said
*"not for login,"* so silently upgrading them to a (TOTP-bypassing) login path is a consent violation.
Decision: **drop** those identity links so the affected users re-link once and gain identity + login with
explicit consent under the new copy.

Ship a **data-only migration** in the Prisma migration pipeline (custom SQL, runs via
`prisma migrate deploy` on deploy — deterministic for self-hosters). It clears the identity fields for
exactly the identity-only links, leaving Discord-*login* accounts (which have the row) untouched:

```sql
UPDATE "user"
SET discord_user_id = NULL, discord_username = NULL
WHERE discord_user_id IS NOT NULL
  AND id NOT IN (SELECT user_id FROM "account" WHERE provider_id = 'discord');
```

The `NOT IN (… provider_id = 'discord')` clause is what protects claimed Discord-login accounts — those
have both the field and the row, so they are excluded. After deploy, affected users (including the owner's
current link) see "Link Discord" again; re-linking runs the new change 1 and creates the account row.
Cost, accepted: `@mention` mapping for those users is lost until they re-link.

## Edge cases & guardrails

- **Idempotent re-link / relink to a different Discord id** — handled in change 1 (find-or-create/update).
- **Discord id already used by another user** — existing conflict check rejects (409) before any write.
- **Unlink then re-link** — supported; deletes then recreates the row.
- **No lockout** — password credential is never removed by this feature; the account keeps at least one
  login method at all times.
- **Discord-only accounts unaffected** — `authMethod === "discord"` accounts don't see this card and can't
  add a password (out of scope).
- **Invite-only preserved** — `disableImplicitSignUp` stays `true`; rows are only created for the
  authenticated user linking their own account.

## Testing

Integration (`discord-account.service.integration.spec.ts`) — extend, don't rewrite:

- Linking a password account **creates** the `discord` account row (assert row exists with correct
  `accountId`), and a subsequent Discord-identity lookup resolves to that user.
- Re-linking the same id is a no-op; re-linking a different id updates `accountId`.
- Linking still rejects a `discordUserId` already bound to another user (409).
- Linking still rejects a non-`password_totp` account (422).
- **Unlink deletes** the `discord` account row and nulls the user fields; password credential row remains.
- Tenancy/scope: identity-only-style checks stay green; only the `identify` scope is used.

Migration (change 6) — an integration test seeds two users (one identity-only link with no `discord`
account row; one Discord-login account with the row), runs the drop SQL, and asserts the identity-only
user's `discordUserId`/`discordUsername` are nulled while the Discord-login account keeps both its fields
and its row (targeting is correct; no login accounts collateral-damaged).

Web (`SettingsPage` test) — update assertions for the new copy and the 2FA recommendation.

Full local bar before "done": `pnpm lint`, `pnpm typecheck`, `pnpm test`, and the auth-relevant
`pnpm test:e2e` journeys.

## Documentation

- **New ADR-0011** — "Password accounts may add Discord as an additional login method." Records the
  reversal of ADR-0009's exclusivity (password → Discord direction), the account-table model, and the
  re-affirmed, accepted TOTP-bypass tradeoff + the 2FA recommendation mitigation.
- **ADR-0009** — status updated to "Partially superseded by ADR-0011 (2026-07-15)"; the
  "Allowing both methods on one account — rejected" alternative annotated as reversed for this direction.
- **CLAUDE.md / docs** — refresh the auth summary lines that assert "exactly one login method per account."

## Out of scope

- Discord-login accounts setting a password (symmetric direction).
- Step-up TOTP on the Discord path (rejected: fights Better Auth's social flow; owner accepted no-TOTP).
- Any change to the claim flow or admin-assisted method changes.
