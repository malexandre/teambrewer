# Phase 00 — Foundation

**Goal** — Stand up the empty-but-complete skeleton every later phase builds on: a version-controlled
pnpm monorepo (`apps/web`, `apps/api`, `packages/shared`) with strict TypeScript, linting, a full test
harness (Vitest + Playwright + ephemeral Postgres), GitHub Actions CI, a Docker Compose stack (Postgres +
API + Nginx), a NestJS API exposing `/api/health`, a React + Vite PWA shell wired to TanStack Router +
Query and Tailwind + shadcn/ui, and Prisma initialized with a base migration. No product features — this
phase exists so that from phase-01 onward, adding a feature is only writing that feature, never plumbing.

**Depends on** — Nothing. This is the first phase.

**Implements** — No feature spec (infrastructure only). Establishes the layout and tooling described in:
- [../architecture/overview.md](../architecture/overview.md) · [../architecture/tech-stack.md](../architecture/tech-stack.md)
- [../architecture/testing-strategy.md](../architecture/testing-strategy.md) · [../architecture/api-conventions.md](../architecture/api-conventions.md)
- [../architecture/frontend.md](../architecture/frontend.md) · [../architecture/security.md](../architecture/security.md)
- [ADR-0001 tech-stack](../decisions/0001-tech-stack.md)

**Scope**
- Git repository with Conventional Commits tooling and a comprehensive `.gitignore`. (The repo already
  exists from the knowledge-base session — `main`, with `.gitignore` and the initial docs commits — so this
  phase **adds the Conventional Commits tooling and builds on it**, it does not re-initialize.)
- pnpm workspace monorepo: `apps/web`, `apps/api`, `packages/shared`.
- Shared TypeScript config in **strict** mode; ESLint + Prettier consistent across all packages.
- Test harness: Vitest (unit + integration) with an ephemeral Postgres test database; Playwright (e2e).
- GitHub Actions CI running lint + typecheck + test.
- Docker Compose stack: PostgreSQL, the NestJS API, and Nginx (serving the web build, reverse-proxying `/api`).
- Prisma initialized against Postgres with an empty base migration.
- NestJS bootstrap exposing `GET /api/health`.
- Vite React PWA shell with TanStack Router + Query, Tailwind + shadcn/ui, and the PWA plugin.
- `packages/shared` scaffold exporting Zod and a first shared schema/type (e.g. the health response).
- `.env.example` documenting every environment variable the stack reads.

**Deliverables**
- Repo root: `package.json` (workspace scripts), `pnpm-workspace.yaml`, `.gitignore`, `.editorconfig`,
  `tsconfig.base.json`, `.prettierrc`, shared ESLint config, `commitlint`/Conventional Commits config,
  `.env.example`, `docker-compose.yml`, `README.md` (dev quickstart).
- `.github/workflows/ci.yml` — lint, typecheck, unit/integration tests (with a Postgres service).
- `apps/api/` — NestJS app: `main.ts`, `app.module.ts`, a `HealthModule` with `GET /api/health`,
  a global `/api` prefix, `Dockerfile`, `vitest.config.ts`, `tsconfig.json`.
- `apps/api/prisma/` — `schema.prisma` (datasource + generator, no domain models yet) and the initial
  empty base migration under `prisma/migrations/`.
- `apps/web/` — Vite React app: app shell with router + query + theme providers, one placeholder route,
  Tailwind + shadcn/ui initialized (`components.json`, base primitives), `vite-plugin-pwa` config + manifest,
  `Dockerfile` (or Nginx static-build target), `vitest.config.ts`, `tsconfig.json`.
- `packages/shared/` — `package.json`, `tsconfig.json`, `src/index.ts` re-exporting a first Zod schema
  (e.g. `healthResponseSchema`) and its inferred type.
- `infra/nginx/` — Nginx config serving the web build and proxying `/api` to the API service.
- Root scripts: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`
  (matching the contract in [CLAUDE.md](../../CLAUDE.md) "Commands").

**Task checklist**
- [x] Confirm the git repo is initialized (it already is — created in the knowledge-base session with `main`, `.gitignore`, and the docs commits). Extend `.gitignore` for the new toolchain (dist/build, coverage, Playwright artifacts) if anything is missing.
- [x] Configure Conventional Commits tooling (commitlint + a commit-msg hook via Husky or lefthook).
- [x] Create the pnpm workspace: `pnpm-workspace.yaml` listing `apps/*` and `packages/*`; root `package.json` with workspace scripts.
- [x] Add `tsconfig.base.json` (strict: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, etc.); per-package `tsconfig.json` extending it.
- [x] Add shared ESLint + Prettier config; wire `pnpm lint` and `pnpm typecheck` to run across all packages.
- [x] Scaffold `packages/shared` with Zod; export a `healthResponseSchema` and its `z.infer` type; write a unit test for it (test-first).
- [x] Bootstrap `apps/api` (NestJS): global `/api` prefix, a `HealthModule`. Write an integration test for `GET /api/health` **before** the handler; then implement it to return `{ status: 'ok' }` validated against the shared schema.
- [x] `prisma init` in `apps/api`; set the datasource to Postgres via `DATABASE_URL`; generate the first empty base migration.
- [x] Set up the Vitest integration harness: spin up an ephemeral Postgres (Docker service or Testcontainers), apply migrations, reset between tests (see [testing-strategy](../architecture/testing-strategy.md)).
- [x] Bootstrap `apps/web` (Vite + React + TS): install TanStack Router + Query, Tailwind, shadcn/ui (`components.json` + a couple of base primitives), `vite-plugin-pwa` (+ manifest + icons).
- [x] Wire the web app shell: router, `QueryClientProvider`, theme provider; a placeholder route that calls `/api/health` through the shared schema to prove the contract end to end. Add a component/hook test.
- [x] Write the root `docker-compose.yml`: `postgres`, `api`, `nginx` services on a private network; Postgres not exposed publicly; Nginx serves the web build and proxies `/api`.
- [x] Add `Dockerfile`s for `api` and the web build; add the Nginx config under `infra/nginx/`.
- [x] Author `.env.example` for every variable (`DATABASE_URL`, API port, web origin/CORS, etc.); ensure `.env` is git-ignored.
- [x] Add `.github/workflows/ci.yml` (install, lint, typecheck, unit/integration tests against a Postgres service). It activates on push **once a remote exists**; for now ensure the same steps pass **locally** via the `pnpm` scripts.
- [x] Add a minimal Playwright e2e smoke test (app loads, health check succeeds) and wire `pnpm test:e2e`.
- [x] Update the "Commands" section of [CLAUDE.md](../../CLAUDE.md) to reflect what actually exists; mark phase-00 done in [README.md](README.md).

**Tests & verification**
- **Unit (Vitest):** `healthResponseSchema` parses a valid payload and rejects an invalid one.
- **Integration (Vitest + test DB):** `GET /api/health` returns 200 `{ status: 'ok' }`; the harness applies
  migrations to the ephemeral Postgres and tears it down cleanly.
- **Component (Vitest + Testing Library):** the placeholder route renders the health status.
- **E2E (Playwright):** the app loads in a browser and shows a healthy status.
- **Manual end-to-end proof (run and observe):**
  - `pnpm install` completes with no errors.
  - `pnpm dev` serves web + api in watch mode; opening the web app shows the health status; `curl http://localhost:<apiPort>/api/health` returns `{ "status": "ok" }`.
  - `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass; `pnpm test:e2e` passes.
  - `docker compose up` boots Postgres + API + Nginx; the app is reachable through Nginx and `/api/health` responds through the proxy.
  - The CI workflow's steps **pass locally** (run lint + typecheck + tests as CI would). "Green on push" requires a
    GitHub remote — creating/pushing to a remote is an **outward-facing action needing the user's go-ahead**
    (see [git-and-commits](../../.claude/rules/git-and-commits.md)); until a remote exists, local CI-step passing is the bar.
- No tenant-isolation tests apply yet (no team-owned data exists); the isolation backbone lands in phase-01.

**Out of scope**
- Any authentication, users, teams, or tenancy (phase-01).
- Any domain models/migrations beyond the empty base (phases 01+).
- Card data, decks, or any feature module.
- Production hardening, backups, TLS/Let's Encrypt automation, offline PWA caching strategy (phase-13).

**See also**
- [../architecture/overview.md](../architecture/overview.md) · [../architecture/tech-stack.md](../architecture/tech-stack.md) · [../architecture/testing-strategy.md](../architecture/testing-strategy.md)
- [ADR-0001 tech-stack](../decisions/0001-tech-stack.md)
- Skills: [implementing-a-phase](../../.claude/skills/implementing-a-phase/SKILL.md) · [adding-a-feature-module](../../.claude/skills/adding-a-feature-module/SKILL.md)
- Next: [phase-01 Auth & Tenancy](phase-01-auth-and-tenancy.md)
