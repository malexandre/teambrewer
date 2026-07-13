# Phase 13 — Polish, PWA & Hardening

## Goal

Take the feature-complete app to a shippable, self-hostable v1: finish the **PWA** (installable,
offline-tolerant), do a **responsive/accessibility** polish pass, complete **security hardening** (rate
limiting, security headers, CSRF/CORS, dependency audit), document **self-hosting ops** (backup/restore,
`.env`, TLS), run a **performance** pass, and **sync the docs** to reality. This is the cross-cutting
finishing phase — no new product features.

## Depends on

- [phase-11 — Dashboard](phase-11-dashboard.md) — the last feature phase and the likely landing screen;
  per the [roadmap graph](README.md) this phase depends on it. In practice all feature phases (00–12)
  should be done, since this phase hardens and polishes the whole app.

## Implements

- Architecture: [security](../architecture/security.md), [frontend](../architecture/frontend.md)
  (PWA + mobile + a11y), [testing-strategy](../architecture/testing-strategy.md),
  [multi-tenancy](../architecture/multi-tenancy.md) (isolation must survive caching), [overview](../architecture/overview.md)
- Decisions: [ADR-0003 no-email-auth](../decisions/0003-no-email-auth.md) (rate-limit auth + link
  generation/consumption), [ADR-0008 multi-tenant-teams](../decisions/0008-multi-tenant-teams.md)
- Domain: [card-data-sources](../domain/card-data-sources.md) (card data is the safe-to-cache offline set)

## Scope

Five workstreams, all cross-cutting:

1. **PWA finalization** — installable web-app manifest (icons, name, theme/background color, display
   `standalone`), a service worker with a deliberate caching strategy: **offline-tolerant caching of card
   reference data and read-only views** (cache-first for immutable card data with a version bust on sync;
   stale-while-revalidate for read views). If feasible, a **fast mobile game-logging offline queue** that
   accepts a game log while offline and syncs it when back online (the most common phone flow per
   [frontend](../architecture/frontend.md)). Offline must **never** serve another team's cached data.
2. **Responsive & accessibility pass** — audit key screens at phone widths (dashboard, game-log form,
   matchup matrix, deck/event pages); keyboard navigation, focus management, ARIA correctness, color
   contrast, large tap targets, safe-area insets; light/dark theme consistency.
3. **Security hardening** — **rate limiting** on auth and on setup/reset **link generation + consumption**
   (per [ADR-0003](../decisions/0003-no-email-auth.md)) and other expensive endpoints; **security headers**
   via Nginx and/or `helmet` (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy);
   **CSRF** protection for cookie auth and **CORS** locked to the app origin; **dependency audit** runnable
   locally (`pnpm audit`) and wired into CI once a remote exists; confirm no secrets/PII in logs and that
   tenant-violation attempts are logged.
4. **Self-hosting ops** — documented **backup/restore** for PostgreSQL (dump + restore procedure; note that
   backups contain all tenants and must be protected); a documented, complete **`.env.example`** for every
   required secret/config; **TLS via Nginx** (Let's Encrypt) with HTTPS assumed; least-privilege DB user;
   Postgres not exposed publicly (Docker network only).
5. **Performance pass** — review/add DB **indexes** (composite `(teamId, …)` on hot paths), optimize
   **matchup aggregation** queries (consider materialization if measured slow), and review frontend
   **TanStack Query cache keys**/invalidation for correctness and efficiency.
6. **Docs sync** — update root `CLAUDE.md` commands to match reality, mark the
   [roadmap Status table](README.md) done, and reconcile any docs that drifted during implementation.

## Deliverables

- `apps/web` PWA: `manifest.webmanifest` + icon set + service worker (via the Vite PWA tooling chosen in
  [tech-stack](../architecture/tech-stack.md)); documented caching strategy; optional offline game-log
  queue.
- Nginx config with TLS + security headers; `helmet` configured in the API; CORS allow-list; CSRF
  protection verified for the cookie-based Better Auth flow.
- Rate-limiting middleware/guards on auth, link generation/consumption, and expensive endpoints, with
  configurable limits documented in `.env.example`.
- CI step running a dependency audit (e.g. `pnpm audit`) and failing on high-severity issues.
- `docs/` (or `README`) **backup/restore runbook** for Postgres; complete `.env.example`; TLS setup notes.
- Migration(s) adding any missing indexes found in the performance pass.
- Playwright **e2e smoke suite** covering the critical journeys end-to-end.
- Updated `CLAUDE.md` commands section and roadmap Status table.

## Task checklist (test-first, ordered)

- [x] Read [security](../architecture/security.md), [frontend](../architecture/frontend.md),
      [testing-strategy](../architecture/testing-strategy.md), [tech-stack](../architecture/tech-stack.md),
      and the [`implementing-a-phase`](../../.claude/skills/implementing-a-phase/SKILL.md) skill.
- [x] Write failing rate-limit integration tests (auth login, setup/reset link generation + consumption
      exceed the limit → 429); then implement the rate limiting. *(env-configurable; Better Auth limiter for
      login; strict for links; expensive limit for matchup reads + card sync.)*
- [x] Add security headers (Nginx + helmet), CSRF, and CORS lock-down; write tests/checks asserting the
      headers are present and cross-origin requests are rejected. *(CSRF = SameSite + CORS + OriginCheckGuard.)*
- [x] Implement the PWA manifest + service worker; write a test/check that card data + read views load
      offline and that **no cross-team data** is served from cache after switching teams. *(App-shell
      precache + card-image CacheFirst + tenancy-safe persisted TanStack cache; smoke reload-isolation test.)*
- [ ] (If feasible) implement the offline game-log queue; test that a log created offline persists and
      syncs on reconnect, scoped to the correct team. *(Deferred with the user — documented future
      enhancement; broader offline write is out of scope.)*
- [x] Do the responsive/a11y pass; add automated a11y checks (e.g. axe in Playwright) on key screens and
      fix violations. *(axe scan of 5 screens; fixed a muted-foreground contrast miss; added the theme toggle.)*
- [x] Performance pass: measure hot queries, add indexes via migration, optimize matchup aggregation,
      review query keys; add a regression test for aggregation correctness after any change. *(Added the
      (teamId, playedAt DESC, id DESC) index; kept the pure, unit-tested aggregation; measure-first, no
      materialization; documented the budget.)*
- [x] Write the Playwright e2e smoke suite for critical journeys (below).
- [x] Write the backup/restore runbook; complete `.env.example`; document TLS setup. *(docs/ops/self-hosting.md.)*
- [x] Add a dependency-audit script (`pnpm audit`) runnable locally; wire it into CI once a remote exists.
- [x] Sync `CLAUDE.md` commands and the roadmap Status table; reconcile drifted docs.
- [x] Run the full verification below.

## Tests & verification

**E2E smoke of critical journeys (Playwright).** At minimum, all green:
- Setup link → set password → set up TOTP → land in a team ([ADR-0003](../decisions/0003-no-email-auth.md)).
- Create a deck, log a game right after playing, view the resulting matchup.
- **Tenant isolation e2e:** switch teams shows only that team's data (also verify the switch invalidates
  caches and the **service worker cache** does not leak the previous team's data).
- Dashboard loads and its "what to test next" reflects the seeded gauntlet.

**PWA install/offline check.** App is installable (manifest valid, service worker registers); with the
network offline, card data and read-only views render from cache; a Lighthouse/PWA audit passes the
installability + offline criteria. Confirm offline cache is per-origin but respects team scoping (no
cross-team bleed).

**Rate-limit tests.** Auth login and setup/reset link generation + consumption return 429 past the
configured threshold; limits are configurable via env.

**Security checks.** Security headers present (assert CSP/HSTS/X-Frame-Options/X-Content-Type-Options);
CORS rejects a foreign origin; CSRF protection blocks a forged cross-site state-changing request; `pnpm
audit` (or equivalent) passes locally (and in CI once a remote is configured); no secrets/PII in logs.

**Performance.** Hot list/matchup queries stay within a documented budget on a realistic dataset; new
indexes present; aggregation results unchanged after optimization (regression test).

**End-to-end steps to prove it works:**
1. `pnpm test` (unit/integration incl. rate-limit + isolation) and `pnpm test:e2e` (smoke + a11y) green.
2. `docker compose up` — full self-hosted stack (Postgres + api + nginx) boots over HTTPS with headers set.
3. Install the PWA on a phone/emulator; go offline; confirm card data + read views work and no cross-team
   data appears after switching teams.
4. Run the **backup/restore runbook** end-to-end: back up, restore into a fresh DB, verify data intact.
5. `pnpm lint && pnpm typecheck` clean; `CLAUDE.md` + roadmap Status table reflect reality.

## Out of scope

- New product features or new domain entities (this is a hardening/polish phase only).
- Transactional email / self-service email recovery (explicitly rejected in
  [ADR-0003](../decisions/0003-no-email-auth.md)).
- External meta feeds or decklist scraping ([ADR-0007](../decisions/0007-external-data-approach.md)).
- Full offline write support beyond the game-log queue (broader offline editing is a future enhancement).
- Multi-instance / horizontal-scaling infrastructure beyond the documented single-node Docker Compose
  stack.

## See also

- Architecture: [security](../architecture/security.md) · [frontend](../architecture/frontend.md) ·
  [testing-strategy](../architecture/testing-strategy.md) · [tech-stack](../architecture/tech-stack.md) ·
  [multi-tenancy](../architecture/multi-tenancy.md) · [overview](../architecture/overview.md)
- Decisions: [ADR-0003 no-email-auth](../decisions/0003-no-email-auth.md) ·
  [ADR-0008 multi-tenant-teams](../decisions/0008-multi-tenant-teams.md) ·
  [ADR-0007 external-data-approach](../decisions/0007-external-data-approach.md)
- Domain: [card-data-sources](../domain/card-data-sources.md)
- Prior phase: [phase-11 — Dashboard](phase-11-dashboard.md)
- Skills: [`implementing-a-phase`](../../.claude/skills/implementing-a-phase/SKILL.md)
