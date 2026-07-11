# Tech Stack

Every choice below was researched against current (2026) practice and matched to TeamBrewer's needs:
self-hosted, internal, mobile-friendly, modular, maintainable, and built incrementally by agents. The
formal decision is [ADR-0001](../decisions/0001-tech-stack.md); this doc is the working reference.

> Rule: when you actually implement, **check the current official docs** for each library — versions and
> best practices move fast. See [`../../.claude/rules/coding-standards.md`](../../.claude/rules/coding-standards.md).

## Summary

| Layer | Choice | Why (short) |
|---|---|---|
| Language | **TypeScript** everywhere | One language, shared types, safer refactors. |
| Monorepo | **pnpm workspaces** | Simple, fast, first-class workspace support; shared package for types. |
| Frontend | **React + Vite** SPA, **PWA** | Static build on any web server, no vendor lock-in, great mobile/offline story for an internal API-consuming app. |
| Routing/data | **TanStack Router + TanStack Query** | Type-safe routing; robust server-state caching/invalidation. |
| UI | **Tailwind CSS + shadcn/ui** | Responsive, readable, **ownable** component code (not a black-box library). |
| Backend | **NestJS** | Opinionated, modular (modules/controllers/services/DI) → consistent structure for incremental, agent-built code. |
| Database | **PostgreSQL** | Mature relational DB; ideal for the relational, multi-tenant data. |
| ORM | **Prisma 7** | Best-in-class DX for complex relational work; TS/WASM engine (small bundle) since Prisma 7 (Nov 2025). |
| Validation | **Zod** (in `packages/shared`) | One schema validates the API and types the client. |
| Auth | **Better Auth** | Self-hosted, native TOTP 2FA + backup codes + admin/invite tooling. Lucia is deprecated. |
| Testing | **Vitest** + **Playwright** | Fast unit/integration (Vitest) and e2e (Playwright). |
| Lint/format | **ESLint + Prettier** | Consistency; enforced in CI. |
| CI | **GitHub Actions** | Lint + typecheck + test; ready for when the repo lands on GitHub. |
| Deploy | **Docker Compose** (Postgres + API + Nginx) | Simple self-hosting on one VPS. |

## Rationale highlights

### Frontend: Vite SPA over Next.js
TeamBrewer is an **internal, authenticated, API-consuming** app with **no SEO needs**. A Vite SPA builds
to static assets that any web server (Nginx on a $5 VPS) can serve — no server runtime, no vendor
coupling, minimal ops. Next.js's strengths (SSR/SEO, server components, Vercel integration) don't apply
here and would add moving parts. The SPA is **PWA-enabled** for a good phone experience (installable,
offline-tolerant caching of card data and read views).

### Backend: NestJS over Fastify/Express
The user prioritizes **modularity and human-readability**, and the app will be built **across many agent
sessions**. NestJS's opinionated module/DI structure makes every feature look the same, which reduces
variance and makes incremental, agent-authored code predictable and maintainable. Fastify is lighter but
leaves structure to discipline; NestJS bakes it in. (NestJS runs on an Express or Fastify adapter under
the hood if raw performance ever matters.)

### ORM: Prisma over Drizzle
The data is **monolithic and relational** (teams, decks, events, games, matchups, suggestions, comments).
Prisma's schema-first modeling, migrations, and query ergonomics fit this better than Drizzle's
SQL-first, edge-optimized approach — and we're not deploying to the edge.

### Auth: Better Auth
Matches the exact requirements: **self-hosted, invite-only (no open signup), mandatory TOTP 2FA + backup
codes, admin tooling**, and it lets us **generate invite/reset links without sending email** (we handle
delivery ourselves — i.e. we don't). Lucia is deprecated in 2026; hosted options (Clerk/Auth0) violate the
self-hosted requirement. See [ADR-0003](../decisions/0003-no-email-auth.md).

## Notable versions / caveats (verify at build time)
- **Prisma 7** (Nov 2025) moved off the Rust engine to TS/WASM — confirm current major version.
- **Vite 8** (Rolldown bundler) — confirm current major version.
- **Better Auth** ships features rapidly — confirm the TOTP/admin/organization plugin APIs against current
  docs when building phase-01. Note we use Better Auth's building blocks but a **custom team model** may be
  simpler than its organization plugin for our isolation needs — decide in phase-01 (see
  [multi-tenancy](multi-tenancy.md)).
