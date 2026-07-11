# ADR-0001: Tech stack

- **Status:** Accepted (2026-07-11)
- **Context:** New self-hosted, internal, mobile-friendly, modular app built incrementally by AI agents
  across many sessions. User asked for React + Node, modularity, readability, and a researched
  recommendation.

## Decision

- **Language:** TypeScript everywhere.
- **Monorepo:** pnpm workspaces (`apps/web`, `apps/api`, `packages/shared`).
- **Frontend:** React + Vite SPA (PWA), TanStack Router + TanStack Query, Tailwind + shadcn/ui.
- **Backend:** NestJS.
- **Database/ORM:** PostgreSQL + Prisma 7.
- **Validation:** Zod in `packages/shared` (shared by web and api).
- **Auth:** Better Auth (see [ADR-0003](0003-no-email-auth.md)).
- **Testing:** Vitest + Playwright.
- **Deploy:** Docker Compose (Postgres + API + Nginx). Source on GitHub.

Full rationale: [`../architecture/tech-stack.md`](../architecture/tech-stack.md).

## Consequences

- Consistent, predictable structure (NestJS modules) that suits agent-authored, multi-session work.
- Static SPA is trivial to self-host on a VPS; no vendor lock-in; strong mobile/PWA story.
- Shared Zod schemas eliminate frontend/backend type drift.
- Slightly more backend boilerplate (NestJS) — accepted for the maintainability payoff.

## Alternatives considered

- **Next.js full-stack** — rejected: SSR/SEO not needed; adds server runtime + vendor coupling for an
  internal API-consuming SPA.
- **Fastify/Express backend** — rejected as primary: lighter but leaves structure to discipline; NestJS
  bakes modular consistency in (can use a Fastify adapter under NestJS if needed).
- **Drizzle ORM** — rejected: better for edge/serverless; our data is monolithic and relational, where
  Prisma's DX wins.
