# Phase 01 — Auth & Tenancy

**Goal** — Build the security backbone every later feature depends on: invite-only authentication (password
+ mandatory TOTP + backup codes) with **no email server**, and multi-tenant team isolation enforced
server-side. This phase delivers the `User`/`Team`/`TeamMembership` models, admin-generated single-use
hashed setup/reset links, the `TeamContextGuard` that verifies membership on every request, a mandatory
team-scoped data-access helper so feature code cannot forget `teamId`, and the frontend onboarding and
active-team experience. Nothing team-owned is built in later phases until this is proven, because tenant
isolation is a **security property**, not a UI filter.

**Depends on** — [phase-00 Foundation](phase-00-foundation.md).

**Implements**
- Features: [accounts-and-auth](../features/accounts-and-auth.md) · [teams-and-membership](../features/teams-and-membership.md)
- ADRs: [ADR-0003 no-email-auth](../decisions/0003-no-email-auth.md) · [ADR-0008 multi-tenant-teams](../decisions/0008-multi-tenant-teams.md)
- Architecture: [security](../architecture/security.md) · [multi-tenancy](../architecture/multi-tenancy.md) · [api-conventions](../architecture/api-conventions.md) · [data-model](../architecture/data-model.md#identity--tenancy) · [frontend](../architecture/frontend.md#auth-ux)

**Scope**
- Better Auth integrated: password login, **mandatory TOTP 2FA**, **backup codes**; secure httpOnly
  sameSite session cookies with revocation. Decide (and document here) whether to use Better Auth's
  organization plugin or a **custom team model** — the custom model is expected to be simpler for strict
  isolation ([tech-stack](../architecture/tech-stack.md) notes this open question).
- No open signup. **No email.** Admin-generated **single-use, hashed, expiring** setup and reset links.
- Data models + migrations: `User` (with `isInstanceAdmin`, `displayName`, `totpEnabled`), `Team` (bound to
  exactly one `gameId`), `TeamMembership` (role `team_admin` | `member`), `SetupToken`/`InviteLink`
  (`purpose: 'setup' | 'reset'`, `tokenHash`, `expiresAt`, `usedAt`), backup codes (hashed, single-use).
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
  - `AuthModule` wiring Better Auth (mounted handlers for sessions/TOTP/backup codes).
  - `TeamContextGuard` + a request-context provider exposing verified `{ userId, teamId, role }`.
  - A **team-scoped data-access helper** (e.g. `TeamScopedPrisma` / repository base) used by all future
    team-owned modules.
  - Role guards/decorators (`@RequireRole('team_admin')`, instance-admin checks) and a default-deny posture.
  - Admin endpoints (role-guarded), per [accounts-and-auth](../features/accounts-and-auth.md#api-surface):
    `POST /api/admin/users`, `POST /api/admin/users/:userId/setup-link`,
    `POST /api/admin/users/:userId/reset-link`, `POST /api/admin/users/:userId/reset-2fa`,
    `DELETE /api/admin/users/:userId/sessions`, plus team + membership management
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
  - Login page (password → TOTP; "use a backup code instead"; no-email reset guidance).
  - Active-team context + team selector (only the user's teams); switching invalidates team-scoped caches.
  - API client that injects `X-Team-Id`; `queryKeys` helper enforcing `[teamId, resource, params]`.
  - Admin console (create team, create user + copy link, generate reset link, reset 2FA, revoke sessions,
    manage membership/roles) and account settings (change password, regenerate backup codes, view/sign-out sessions).

**Task checklist**
- [ ] Read [accounts-and-auth](../features/accounts-and-auth.md), [teams-and-membership](../features/teams-and-membership.md), [ADR-0003](../decisions/0003-no-email-auth.md), [ADR-0008](../decisions/0008-multi-tenant-teams.md), [security](../architecture/security.md), [multi-tenancy](../architecture/multi-tenancy.md).
- [ ] Confirm current Better Auth APIs (TOTP, backup codes, admin/session revocation) against official 2026 docs; decide organization-plugin vs custom team model and record the choice in this plan + [multi-tenancy](../architecture/multi-tenancy.md) if it differs.
- [ ] Write Zod schemas in `packages/shared` (login, setup, reset, TOTP verify, admin create-user, team, membership, error envelope) — test-first.
- [ ] Add Prisma models + migration for `User`, `Team`, `TeamMembership`, `SetupToken`/backup codes; add unique `(teamId, userId)` and tenancy indexes. Add two-team fixture factories to the test harness (a user in team A, a user in team B, an instance-admin).
- [ ] Integrate Better Auth in `AuthModule`; enable mandatory TOTP + backup codes + secure session cookies + revocation. Enforce that app data is unreachable while `totpEnabled = false`.
- [ ] Implement setup/reset token generation (crypto-random token, store only the **hash**, short expiry, single-use, invalidate older links of the same purpose) and consumption endpoints — write failing integration tests first (single-use, expiry, hashed-at-rest, no enumeration on bad token).
- [ ] Implement `TeamContextGuard`: read `X-Team-Id`, load the caller's `TeamMembership`, 403 if none, attach verified `{ userId, teamId, role }`. Write the guard test **first** (member of A + `X-Team-Id: B` → 403).
- [ ] Implement the **team-scoped data-access helper** and prove with a test that a query issued through it always filters by the context `teamId` and stamps it on writes.
- [ ] Implement role guards/decorators and default-deny; wire the admin endpoints (create team, create user + setup link, reset link, reset 2FA, revoke sessions, membership/role management) with role checks. Write authZ tests first (member → 403; team-admin acting on another team → 403).
- [ ] Add rate limiting to auth + link endpoints; add non-PII audit logging of tenant/auth violations.
- [ ] Build the frontend: API client injecting `X-Team-Id`; `queryKeys` helper; active-team context + selector; setup-link landing; login + TOTP; admin console; account settings. Component/hook tests for the team selector and query-key scoping.
- [ ] Write the canonical Playwright e2e (below).
- [ ] Update [README.md](README.md) status and any doc a decision touched (e.g. the finalized active-team convention in [api-conventions](../architecture/api-conventions.md)).

**Tests & verification**
- **Unit (Vitest):** setup/reset Zod schemas; token hashing (stored value ≠ raw token); backup-code
  hashing + single-use logic.
- **Integration (Vitest + test DB):**
  - Setup token is single-use, expires, hashed at rest; issuing a new setup link invalidates the prior one.
  - Reset link changes only the password; TOTP unaffected. `reset-2fa` forces re-enrolment and invalidates
    old backup codes. Session revocation ends sessions.
  - Login cannot reach app data with `totpEnabled = false`; a backup code works exactly once.
  - Rate limiting triggers on repeated auth/link attempts.
- **Tenant-isolation (mandatory, Vitest + test DB):**
  - A user who is a member of **team A only**, sending `X-Team-Id: B`, gets **403** from `TeamContextGuard`.
  - A **forged/unknown `X-Team-Id`** is rejected (403); cross-tenant resource reads return **404** (no enumeration).
  - The team-scoped data-access helper injects the context `teamId` on reads and stamps it on writes (verified by test).
  - A **team-admin of team A** cannot create/recover users or manage membership in **team B** → 403.
- **Component (Vitest + Testing Library):** team selector lists only the user's teams; switching the active
  team changes query keys so caches do not bleed.
- **E2E (Playwright), canonical journey:** open a setup link → set password → scan/enter TOTP → save backup
  codes → land in the app → select a team → switch to a second team and confirm **only that team's data**
  is shown. Also: log in with password + TOTP; log in once with a backup code.
- **Manual proof:** as instance-admin, create a team and a user, copy the setup link, complete onboarding in
  a fresh browser, log in with TOTP; confirm `pnpm test` (incl. isolation tests) and `pnpm test:e2e` pass and CI is green.

**Out of scope**
- Any team-owned domain feature (decks, cards, events, etc.) — those consume this backbone starting phase-02/03.
- Transactional email / self-service email reset — cut by [ADR-0003](../decisions/0003-no-email-auth.md).
- Multi-game teams — a team is bound to one game ([ADR-0008](../decisions/0008-multi-tenant-teams.md)).
- Card/format/hero reference data (phase-02); note `Team.gameId` references the `Game` catalog, seeded in phase-02.

**See also**
- [accounts-and-auth](../features/accounts-and-auth.md) · [teams-and-membership](../features/teams-and-membership.md)
- [multi-tenancy](../architecture/multi-tenancy.md) · [security](../architecture/security.md) · [api-conventions](../architecture/api-conventions.md) · [data-model](../architecture/data-model.md)
- [ADR-0003](../decisions/0003-no-email-auth.md) · [ADR-0008](../decisions/0008-multi-tenant-teams.md)
- Skills: [implementing-a-phase](../../.claude/skills/implementing-a-phase/SKILL.md) · [adding-a-feature-module](../../.claude/skills/adding-a-feature-module/SKILL.md)
- Prev: [phase-00 Foundation](phase-00-foundation.md) · Next: [phase-02 Card Database](phase-02-card-database.md)
