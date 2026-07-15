# ADR-0011: Password accounts may add Discord as an additional login method

- **Status:** Accepted (2026-07-15)
- **Supersedes (in part):** [ADR-0009](0009-discord-authentication.md) — the "each account uses exactly
  one login method" rule, for the password → Discord direction.

## Context

ADR-0009 made login methods mutually exclusive and allowed a password account to link Discord for
**identity only** (no login). The product owner decided that is too restrictive: if a user links their
Discord, they should be able to sign in with **either** their password + TOTP **or** Discord — their
choice.

## Decision

- A **password + TOTP** account that links Discord can also **sign in with Discord**. Linking is one
  action: it enables login immediately; unlinking revokes it.
- Modelled with Better Auth's account table: **one `user`, two `account` rows** (`credential` +
  `discord`). `authMethod` is unchanged and is no longer the arbiter of login capability.
- **Invite-only preserved:** `disableImplicitSignUp` stays `true`; only the authenticated user's own
  Discord account row is created. Unknown Discord identities are still rejected.
- **Scope:** password → add Discord only. Discord-login accounts cannot add a password here (out of scope).
- **Existing identity-only links are dropped** on deploy (they were made under the old "not for login"
  promise), so those users re-link once for explicit consent.

## The accepted tradeoff (re-affirmed)

The Discord login path is **not** protected by the account's mandatory TOTP (2FA is delegated to Discord).
Anyone controlling the linked Discord account can sign in without the TOTP code. This is accepted for
convenience; mitigation is a clear in-app recommendation to enable Discord 2FA.

## Consequences

- `linkIdentityOnly` / `unlinkIdentity` manage the `discord` account row; login is unchanged Better Auth
  social behaviour. The dead `resolveLoginUser` helper is removed.
- A one-time data migration clears legacy identity-only links.
- ADR-0009's "allowing both methods — rejected" alternative is reversed for this direction.
