# Phase 01 — Auth & Tenancy

**Goal** — Build the security backbone every later feature depends on: invite-only authentication with
**no email server**, where each account uses **exactly one** login method — **password + mandatory TOTP +
backup codes** or **Discord SSO** — and multi-tenant team isolation enforced server-side. This phase delivers the `User`/`Team`/`TeamMembership` models, admin-generated single-use
hashed setup/reset links, the `TeamContextGuard` that verifies membership on every request, a mandatory
team-scoped data-access helper so feature code cannot forget `teamId`, and the frontend onboarding and
active-team experience. Nothing team-owned is built in later phases until this is proven, because tenant
isolation is a **security property**, not a UI filter.

**Depends on** — [phase-00 Foundation](phase-00-foundation.md).

**Implements**
- Features: [accounts-and-auth](../features/accounts-and-auth.md) · [teams-and-membership](../features/teams-and-membership.md)
- ADRs: [ADR-0003 no-email-auth](../decisions/0003-no-email-auth.md) · [ADR-0008 multi-tenant-teams](../decisions/0008-multi-tenant-teams.md) · [ADR-0009 discord-authentication](../decisions/0009-discord-authentication.md)
- Architecture: [security](../architecture/security.md) · [multi-tenancy](../architecture/multi-tenancy.md) · [api-conventions](../architecture/api-conventions.md) · [data-model](../architecture/data-model.md#identity--tenancy) · [frontend](../architecture/frontend.md#auth-ux)

**Scope**
- Better Auth integrated: **password login + mandatory TOTP 2FA + backup codes**, **and Discord SSO** as an
  alternative login method (Better Auth Discord social provider, `identify` scope only, OAuth `state`);
  secure httpOnly sameSite session cookies with revocation. Decide (and document here) whether to use Better
  Auth's organization plugin or a **custom team model** — the custom model is expected to be simpler for
  strict isolation ([tech-stack](../architecture/tech-stack.md) notes this open question).
- **Each account uses exactly one login method** (`authMethod: 'password_totp' | 'discord'`); mutually
  exclusive for login; switching is admin-assisted. Password accounts may optionally link a Discord identity
  (identity only, not login). See [ADR-0009](../decisions/0009-discord-authentication.md).
- **Invite-only preserved for Discord too:** no auto-provisioning; a Discord login only succeeds for an
  admin-provisioned account (pre-bound `discordUserId` or a consumed `discord_link` claim token).
- No open signup. **No email.** Admin-generated **single-use, hashed, expiring** setup / reset / Discord-claim links.
- Data models + migrations: `User` (with `isInstanceAdmin`, `displayName`, `authMethod`, `totpEnabled?`,
  `discordUserId?` (unique), `discordUsername?`), `Team` (bound to exactly one `gameId`), `TeamMembership`
  (role `team_admin` | `member`), `SetupToken`/`InviteLink`
  (`purpose: 'setup' | 'reset' | 'discord_link'`, `tokenHash`, `expiresAt`, `usedAt`), backup codes
  (hashed, single-use).
- **Config:** `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` in `.env.example` (secrets
  via env / Docker secrets).
- Roles: **instance-admin** (global), **team-admin** (per team), **member** (per team) — enforced per the
  capability table in [multi-tenancy](../architecture/multi-tenancy.md#roles--capabilities).
- **`TeamContextGuard`**: resolves the authenticated `userId`, reads the client-indicated active team,
  verifies a `TeamMembership` exists, and attaches a verified `{ userId, teamId, role }` to the request.
- **Mandatory team-scoped data-access helper** (request-scoped Prisma wrapper or repository base class) that
  injects `teamId` into every query and stamps it on writes, so feature modules cannot leak across teams.
- **Active-team resolution convention** (chosen here, used everywhere): the **`X-Team-Id` request header**.
  See "Decision: active-team convention" below.
- Admin endpoints + UI: create team (instance-admin), create user + copy setup link, generate reset link,
  reset 2FA, revoke sessions, manage membership and roles.
- Frontend: setup-link landing (set password → TOTP QR + manual secret → show backup codes once), login +
  TOTP (with backup-code affordance and "ask your admin for a reset link" messaging), active-team selector
  + context, and **team-scoped TanStack Query keys**.

**Decision: active-team convention (finalized in this phase)**
[api-conventions](../architecture/api-conventions.md) leaves the choice open between an `X-Team-Id` header and
a `/api/teams/:teamId/...` path prefix. **This phase adopts the `X-Team-Id` header.** Rationale: it keeps
resource routes flat (`/api/decks`, not `/api/teams/:teamId/decks`), keeps the verified `teamId` out of the
URL, and maps cleanly to a single interceptor on the backend and a single header-injecting API client on the
frontend. Every authenticated, team-scoped request MUST send `X-Team-Id`; the `TeamContextGuard` verifies it
against memberships and **never** trusts it for anything beyond selecting which membership to load. If a later
phase finds the header insufficient, change it here and update `api-conventions.md` in the same commit.

**Deliverables**
- **Backend**
  - `apps/api/prisma/schema.prisma` additions + migration: `User`, `Team`, `TeamMembership`, `SetupToken`
    (+ backup-code storage), with `TeamMembership` unique on `(teamId, userId)` and composite `(teamId, ...)`
    indexes ready for team-scoped tables.
  - `AuthModule` wiring Better Auth (mounted handlers for sessions/TOTP/backup codes **and the Discord
    social provider**: login start/callback + `discord_link` claim consumption that binds `discordUserId`).
  - `TeamContextGuard` + a request-context provider exposing verified `{ userId, teamId, role }`.
  - A **team-scoped data-access helper** (e.g. `TeamScopedPrisma` / repository base) used by all future
    team-owned modules.
  - Role guards/decorators (`@RequireRole('team_admin')`, instance-admin checks) and a default-deny posture.
  - Admin endpoints (role-guarded), per [accounts-and-auth](../features/accounts-and-auth.md#api-surface):
    `POST /api/admin/users` (with `authMethod`), `POST /api/admin/users/:userId/setup-link`,
    `POST /api/admin/users/:userId/discord-claim-link`, `POST /api/admin/users/:userId/reset-link`,
    `POST /api/admin/users/:userId/reset-2fa`,
    `DELETE /api/admin/users/:userId/sessions`, plus `POST/DELETE /api/me/discord/link` (identity link for
    password accounts) and team + membership management
    (`POST /api/admin/teams`, membership create/update/remove, role changes) from
    [teams-and-membership](../features/teams-and-membership.md).
  - Link-consumption endpoints: `POST /api/auth/setup/:token`, `POST /api/auth/reset/:token`.
  - Self endpoints: `GET /api/me`, `GET /api/me/teams`, `GET /api/me/sessions`, `DELETE /api/me/sessions/:sessionId`.
  - Rate limiting on auth, link generation, and link consumption; server-side logging of tenant/auth
    violations without PII.
- **Shared** (`packages/shared`): Zod schemas for login, setup/reset payloads, TOTP verification, admin
  create-user, team + membership shapes, and the uniform error envelope.
- **Frontend** (`apps/web/src/features/auth`, `.../teams`, plus `lib/`)
  - Setup-link landing page (password → TOTP QR + manual secret → backup codes shown once with copy/download).
  - Discord claim-link landing page ("Authorize with Discord" → binds identity → land in app).
  - Login page (password → TOTP; "use a backup code instead"; no-email reset guidance) **plus a "Log in with
    Discord" button**.
  - Account settings link/unlink Discord identity for password accounts.
  - Active-team context + team selector (only the user's teams); switching invalidates team-scoped caches.
  - API client that injects `X-Team-Id`; `queryKeys` helper enforcing `[teamId, resource, params]`.
  - Admin console (create team, create user + copy link, generate reset link, reset 2FA, revoke sessions,
    manage membership/roles) and account settings (change password, regenerate backup codes, view/sign-out sessions).

**Task checklist**
- [x] Read [accounts-and-auth](../features/accounts-and-auth.md), [teams-and-membership](../features/teams-and-membership.md), [ADR-0003](../decisions/0003-no-email-auth.md), [ADR-0008](../decisions/0008-multi-tenant-teams.md), [security](../architecture/security.md), [multi-tenancy](../architecture/multi-tenancy.md).
- [x] Confirm current Better Auth APIs (TOTP, backup codes, admin/session revocation) against official 2026 docs; decide organization-plugin vs custom team model and record the choice. **Decided: custom team model** (recorded in this plan + [multi-tenancy](../architecture/multi-tenancy.md)). Better Auth 2026 APIs confirmed via Context7 (see the handoff note).
- [x] Write Zod schemas in `packages/shared` (login, setup, reset, TOTP verify, admin create-user, team, membership, error envelope) — test-first.
- [x] Add Prisma models + migration for `User`, `Team`, `TeamMembership`, `SetupToken`/backup codes; add unique `(teamId, userId)` and tenancy indexes. Add two-team fixture factories to the test harness (a user in team A, a user in team B, an instance-admin). *(Backup codes are stored in Better Auth's `two_factor` table, not a separate table.)*
- [ ] Integrate Better Auth in `AuthModule`; enable mandatory TOTP + backup codes + secure session cookies + revocation. Enforce that app data is unreachable while a password account has `totpEnabled = false`.
- [ ] Configure the Better Auth **Discord social provider** (`identify` scope, OAuth `state`); add `DISCORD_CLIENT_ID/SECRET/REDIRECT_URI` to `.env.example`. Confirm current Better Auth Discord APIs against 2026 docs.
- [ ] Implement Discord provisioning: `authMethod` on account creation; `discord_link` claim-token generation + consumption binding a **unique** `discordUserId`; **reject Discord login with no matching provisioned account** (invite-only). Write these tests **first**.
- [ ] Enforce **login-method exclusivity** (a password account cannot Discord-login and vice-versa); implement identity-only Discord link/unlink for password accounts (does not grant login). Test-first.
- [x] Implement setup/reset token generation (crypto-random token, store only the **hash**, short expiry, single-use, invalidate older links of the same purpose) — `InviteTokenService`, integration-tested (single-use, expiry, hashed-at-rest, no enumeration). *(HTTP consumption endpoints still to wire — need Better Auth to set the password/session.)*
- [x] Implement `TeamContextGuard`: read `X-Team-Id`, load the caller's `TeamMembership`, 403 if none, attach verified `{ userId, teamId, role }`. Guard test written (member of A + `X-Team-Id: B` → 403; forged → 403; 401/400 paths).
- [x] Implement the **team-scoped data-access helper** and prove with a test that a query issued through it always filters by the context `teamId` and stamps it on writes. *(`createTeamScopedClient` / `TeamScopedPrisma`, tested.)*
- [x] Implement role guards/decorators and default-deny; **[ ]** wire the admin endpoints (create team, create user + setup link, reset link, reset 2FA, revoke sessions, membership/role management) with role checks. Role guard + `@RequireInstanceAdmin`/`@RequireTeamRole` + `DomainExceptionFilter` done and unit-tested; **endpoints not yet wired** (need Better Auth for auth-dependent ones).
- [ ] Add rate limiting to auth + link endpoints; add non-PII audit logging of tenant/auth violations. *(Tenant-violation audit logging done in `TeamContextGuard`; rate limiting still to add.)*
- [ ] Build the frontend: API client injecting `X-Team-Id`; `queryKeys` helper; active-team context + selector; setup-link landing; login + TOTP; admin console; account settings. Component/hook tests for the team selector and query-key scoping.
- [ ] Write the canonical Playwright e2e (below).
- [x] Update any doc a decision touched: [multi-tenancy](../architecture/multi-tenancy.md) (custom-team decision) and [api-conventions](../architecture/api-conventions.md) (X-Team-Id + Better Auth table naming). **[ ]** Flip [README.md](README.md) status to ✅ when the phase completes.

**Handoff note (session ending with phase 🚧)**

Done and committed on branch `phase-01-auth-and-tenancy` (all local-green: `pnpm lint`, `typecheck`,
`test` pass; 38 api + shared unit tests):
1. `feat(shared)` — auth/teams/error-envelope Zod schemas.
2. `feat(api)` — Prisma identity/tenancy models + first real migration + `PrismaService` (pg driver
   adapter; CommonJS client via `moduleFormat "cjs"`, un-excluded from the build) + two-team fixtures.
3. `feat(api)` — `InviteTokenService` (hashed, single-use, expiring links).
4. `feat(api)` — `TeamContextGuard` + `@CurrentTeam()` + `createTeamScopedClient`/`TeamScopedPrisma`
   (the tenant-isolation backbone; 15 isolation tests).
5. `feat(api)` — `RoleGuard` + `@RequireInstanceAdmin`/`@RequireTeamRole` + `DomainExceptionFilter`.

Remaining (in rough dependency order):
- **Better Auth mounting (`AuthModule`)** — the linchpin. Confirmed 2026 facts: mount
  `toNodeHandler(auth)` on the Express instance with `NestFactory.create(AppModule, { bodyParser: false })`
  then re-add `express.json()` for non-auth routes; use the **admin plugin** (`createUser`,
  `setUserPassword`, `listUserSessions`, `revokeUserSessions`) — it needs extra columns
  (`role`,`banned`,`banReason`,`banExpires` on user; `impersonatedBy` on session) → **a second migration**;
  `emailAndPassword` with `disableSignUp: true` + `minPasswordLength: 12`; plugins `twoFactor()`,
  `username()`; `user.additionalFields` for displayName/isInstanceAdmin/authMethod/discord*; email is a
  synthetic `<username>@users.teambrewer.local`. Add `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` +
  `DISCORD_CLIENT_ID/SECRET/REDIRECT_URI` to `apps/api/.env.example`. Then add an **authentication guard**
  that calls `auth.api.getSession({ headers })` and sets `request.userId`/`isInstanceAdmin` — this is the
  seam the already-built guards/`TeamScopedPrisma` consume. Provisioning flow: admin `createUser` (random
  password) → setup link → consume → `setUserPassword` → sign in → `enableTwoFactor` → return
  totpURI+backupCodes → verify TOTP.
- **Discord provider** (slice 4): `socialProviders.discord` with `disableImplicitSignUp: true`
  (invite-only), `identify` scope, `state`; claim-token binding of unique `discordUserId`; method
  exclusivity; identity link/unlink. Stub the OAuth provider in tests.
- **Endpoints (slice 7 remainder)**: wire the accounts/teams/self controllers using the built guards +
  `TeamScopedPrisma` + `InviteTokenService`, with authZ + last-admin (422) tests. Note: instance-admins
  are not necessarily team members, so team-scoped admin actions on an arbitrary team need either a bypass
  in `TeamContextGuard` for instance-admins or path-based `teamId` for `/api/admin/*` — decide when wiring.
- **Rate limiting** (slice 8): `@nestjs/throttler` on auth/link endpoints.
- **Frontend** (slice 9) and **Playwright e2e** (slice 10).

Known follow-ups recorded in commits: the team-scoped client is typed as the full `PrismaService` (a
typed scoped client would drop the `create` `teamId` requirement); real Discord credentials needed for
live login (stub-tested only).

**Tests & verification**
- **Unit (Vitest):** setup/reset Zod schemas; token hashing (stored value ≠ raw token); backup-code
  hashing + single-use logic.
- **Integration (Vitest + test DB):**
  - Setup token is single-use, expires, hashed at rest; issuing a new setup link invalidates the prior one.
  - Reset link changes only the password; TOTP unaffected. `reset-2fa` forces re-enrolment and invalidates
    old backup codes. Session revocation ends sessions.
  - Login cannot reach app data with a password account at `totpEnabled = false`; a backup code works exactly once.
  - Rate limiting triggers on repeated auth/link attempts.
- **Discord auth (integration):**
  - A **provisioned** Discord account logs in via the provider; an **unprovisioned** Discord identity is
    **rejected** (no auto-provisioning — invite-only preserved); `discordUserId` is unique.
  - `discord_link` claim token is single-use, hashed at rest, expiring; consuming it binds the Discord identity.
  - **Method exclusivity:** a password account cannot log in via Discord and vice-versa; an identity-linked
    Discord on a password account does **not** grant Discord login. OAuth `state` mismatch is rejected.
- **Tenant-isolation (mandatory, Vitest + test DB):**
  - A user who is a member of **team A only**, sending `X-Team-Id: B`, gets **403** from `TeamContextGuard`.
  - A **forged/unknown `X-Team-Id`** is rejected (403); cross-tenant resource reads return **404** (no enumeration).
  - The team-scoped data-access helper injects the context `teamId` on reads and stamps it on writes (verified by test).
  - A **team-admin of team A** cannot create/recover users or manage membership in **team B** → 403.
- **Component (Vitest + Testing Library):** team selector lists only the user's teams; switching the active
  team changes query keys so caches do not bleed.
- **E2E (Playwright), canonical journey:** open a setup link → set password → scan/enter TOTP → save backup
  codes → land in the app → select a team → switch to a second team and confirm **only that team's data**
  is shown. Also: log in with password + TOTP; log in once with a backup code; and (with a mocked/stubbed
  Discord provider) provision a Discord account, complete the claim flow, and log in with Discord.
- **Manual proof:** as instance-admin, create a team and a user, copy the setup link, complete onboarding in
  a fresh browser, log in with TOTP; confirm `pnpm test` (incl. isolation tests) and `pnpm test:e2e` pass locally (CI runs on push once a remote is configured).

**Out of scope**
- Any team-owned domain feature (decks, cards, events, etc.) — those consume this backbone starting phase-02/03.
- Transactional email / self-service email reset — cut by [ADR-0003](../decisions/0003-no-email-auth.md).
- Discord **bot-delivered** links (auto-DMing setup/claim links) — deferred ([ADR-0009](../decisions/0009-discord-authentication.md)).
- Multi-game teams — a team is bound to one game ([ADR-0008](../decisions/0008-multi-tenant-teams.md)).
- Card/format/hero reference data (phase-02); note `Team.gameId` references the `Game` catalog, seeded in phase-02.

**See also**
- [accounts-and-auth](../features/accounts-and-auth.md) · [teams-and-membership](../features/teams-and-membership.md)
- [multi-tenancy](../architecture/multi-tenancy.md) · [security](../architecture/security.md) · [api-conventions](../architecture/api-conventions.md) · [data-model](../architecture/data-model.md)
- [ADR-0003](../decisions/0003-no-email-auth.md) · [ADR-0008](../decisions/0008-multi-tenant-teams.md)
- Skills: [implementing-a-phase](../../.claude/skills/implementing-a-phase/SKILL.md) · [adding-a-feature-module](../../.claude/skills/adding-a-feature-module/SKILL.md)
- Prev: [phase-00 Foundation](phase-00-foundation.md) · Next: [phase-02 Card Database](phase-02-card-database.md)
