# CLAUDE.md — TeamBrewer

This file orients any agent (or human) working in this repository. **Read it fully before acting.**

## What this project is

TeamBrewer is a private, invite-only web app that helps competitive **Trading Card Game teams** work
together to crack the meta and pick the best decks for each important tournament. Primary game:
**Flesh and Blood** (Riftbound designed-for, built later). One instance hosts **multiple isolated
teams (workspaces)** that never see each other's data.

The authoritative description of the product, domain, architecture, and decisions lives in
[`docs/`](docs/README.md). **`docs/` is the source of truth — this file only tells you how to work.**

## Current state

The app was built phase by phase (phases 00–13) into a shippable, self-hostable **v1**: the pnpm
monorepo + strict TS + the Vitest/Testcontainers/Playwright harness; **Better Auth** (password +
mandatory TOTP, or Discord SSO — invite-only, no email); the **tenant-isolation backbone**
(`TeamContextGuard` + `TeamScopedPrisma` + `TeamAdminGuard`); the global per-game **card database**
(`GameAdapter` seam, Flesh and Blood + Riftbound adapters, idempotent `card:sync`); the
collaboration core (comments, `@mentions` → notifications, activity); and PWA/ops hardening. That
history is real — the per-phase detail lives in the git log and [`docs/plans/`](docs/plans/README.md).

**The current state is the "meta-pivot" redesign** (branch `feat/meta-pivot`), which re-centres the
app on the **metagame** instead of individual events. See
[ADR-0010](docs/decisions/0010-meta-as-organizing-hub.md) (supersedes the event-as-hub ADR-0004).
The primary loop is now **decks ↔ the current meta ↔ tasks**:

- **Meta** (team-scoped) is the organizing hub: a dated window (`[startDate, endDate]`) owning a
  **tiered list of decks to beat** (`MetaDeckEntry` with a `MetaTier`: meta-defining / contender /
  counter-meta / fringe). "Current meta" = the one whose window contains today. Decks link to metas
  (`DeckMeta`, defaulting to the current meta on create). See [`docs/features/metas.md`](docs/features/metas.md).
- **Per-deck readiness** replaces the standalone matchups tab: the confidence-weighted matchup math
  (still single-sourced in `packages/shared`, fed by `GameLog`) is surfaced as a **Readiness** section
  on the deck page — weighted win rate + raw sample + thin-data flag + whether a game-plan exists
  (Tier-1 decks flagged when unplanned). Matchup **game-plans** stay, per deck, with `+card` bodies.
- **Tasks** (unified) merge the two old testing-queue models into one free-form `Task` (title,
  description, optional deck link, status `proposed → assigned → finished|abandoned` with a
  report-on-finish rule, upvotes, assignee). Commentable + activity-tracked. See
  [`docs/features/tasks.md`](docs/features/tasks.md).
- **`+card` inline mentions**: cards are linked inline in prose (task descriptions, game-plan bodies,
  deck notes) as stable `+[[cardId]]` tokens via the shared composer/renderer, mirroring `@member`
  mentions — no structured card-list tables.
- **Lightweight events**: an `Event` is now name / date / location / description / optional `metaId`
  + **RSVP** (`going | interested`). Gauntlets, deck-selection, retrospective, status, and importance
  are gone (the gauntlet moved to Meta). `GameLog` drops `eventId` and gains an optional `metaId`.
- **Navigation**: a left **sidebar** main menu (Decks · Metas · Events · Games · Tasks · Admin\* ·
  Settings) + a top **submenu bar** for sections with sub-pages (Admin → Teams · Accounts · Members),
  collapsing to an accessible drawer on mobile. The authenticated **landing page is Decks**.
- **Removed** entirely: the dashboard, the knowledge base (primers / decisions / polls), the standalone
  matchups tab, the top-level activity tab, the team roster tab (Discord covers it; `@`-autocomplete
  still uses `/members`), and the standalone cards page (the card DB + `CardPicker` remain).

Everything is **local-green** on the meta-pivot branch: **401 API + 259 shared + 123 web**
unit/integration tests and **9 Playwright e2e journeys** (8 desktop + the phone-viewport game-logging
flow), plus `pnpm lint`, `pnpm typecheck`, and `pnpm build`.


## How to work in this repo

1. **Before implementing a phase**, read, in order:
   - The phase plan in [`docs/plans/`](docs/plans/README.md) (e.g. `phase-03-decks.md`).
   - Every feature spec it references in [`docs/features/`](docs/features/).
   - The ADRs it references in [`docs/decisions/`](docs/decisions/).
   - The relevant architecture docs in [`docs/architecture/`](docs/architecture/).
2. **Follow the coding rules** in [`.claude/rules/`](.claude/rules/):
   - [`coding-standards.md`](.claude/rules/coding-standards.md)
   - [`testing.md`](.claude/rules/testing.md)
   - [`git-and-commits.md`](.claude/rules/git-and-commits.md)
   - [`security-and-tenancy.md`](.claude/rules/security-and-tenancy.md)
   - [`data-sources.md`](.claude/rules/data-sources.md)
3. **Use the project skills** in [`.claude/skills/`](.claude/skills/):
   - `start-next-phase` — say **"start the next phase"** to run the next phase end-to-end (autonomously
     where safe) and update the progress trackers. Wraps `implementing-a-phase`.
   - `implementing-a-phase` — the read-first, test-first, commit-atomically workflow for one phase.
   - `adding-a-feature-module` — the standard NestJS module + web feature structure.
   - `working-with-card-data` — card-data sync, search, and preview.
4. **When something is unclear, ask.** Do not guess at requirements. Keep `docs/` correct: if you change
   a decision, update the doc and the ADR in the same commit.

## Non-negotiables (the short list — full detail in the rules and ADRs)

- **Tenant isolation is a security property.** Every domain row is scoped by `teamId`; scoping is
  enforced **server-side** from the authenticated session, never from a client-supplied value. No
  endpoint may return cross-team data. See [`docs/architecture/multi-tenancy.md`](docs/architecture/multi-tenancy.md).
- **Explicit, readable names.** Never abbreviate variables, functions, or identifiers. Names reflect the
  business domain (`confidenceWeight`, not `cw`).
- **Test-first and well tested.** No feature is "done" without meaningful tests, including tenant-isolation
  tests. See [`docs/architecture/testing-strategy.md`](docs/architecture/testing-strategy.md).
- **No scraping.** External decks are referenced by link only; card data comes from sanctioned open
  sources. Respect every third party's terms of service. See [ADR-0007](docs/decisions/0007-external-data-approach.md).
- **Decks are links, not card lists.** The app is not a deck builder. See [ADR-0002](docs/decisions/0002-decks-as-links.md).
- **Prefer current documentation.** For any library/framework/API choice, check current (2026) official
  docs rather than relying on memory — the ecosystem moves fast.
- **Local-first; the remote is deferred.** Everything must build, run, test, and be verified with no git
  remote. Integrate by merging branches into `main` locally; **do not create or push to a remote unless the
  user explicitly asks.** CI (GitHub Actions) activates only once a remote exists; until then the bar is the
  local `pnpm` checks. See [`.claude/rules/git-and-commits.md`](.claude/rules/git-and-commits.md).

## Layout (created in phase-00)

```
apps/
  web/        # React + Vite SPA (PWA)
  api/        # NestJS backend (Prisma under apps/api/prisma)
packages/
  shared/     # Zod schemas + TypeScript types shared by web and api
infra/nginx/  # Nginx config (serves the web build, proxies /api)
docs/         # This knowledge base (source of truth)
.claude/      # Rules, skills, settings for agents
.github/      # CI workflow (activates once a remote exists)
mise.toml     # Pins the toolchain (see below)
docker-compose.yml
```

## Toolchain

Node and pnpm are pinned via **mise** (`mise.toml`): **Node 26.5.0** and **pnpm 11.11.0**, mirrored in
`package.json` (`engines` + `packageManager`) for corepack/CI. TypeScript is pinned to **6.0.3** (not 7.x):
typescript-eslint 8 supports `typescript <6.1.0`, so the native TS 7 compiler would break typed linting.
With mise activated in your shell, `pnpm`/`node` resolve to these pinned versions automatically.

## Commands

- `pnpm install` — install workspace dependencies
- `pnpm start` — **one-command local dev**: boots a local Postgres in Docker (persisted to the gitignored
  `./.docker-data/`), migrates + seeds it, syncs cards on first run, bootstraps an instance-admin (identity
  from `SEED_ADMIN_*` in `./.env`, auto-created on first run), prints that admin's **setup link**, and runs
  web + api in watch mode. See [`docs/ops/local-development.md`](docs/ops/local-development.md).
- `pnpm db:down` — stop the local dev Postgres (data persists in `./.docker-data/`)
- `pnpm dev` — run web + api in watch mode (assumes a running, migrated, seeded database)
- `pnpm build` — build all packages (shared → api/web, topological)
- `pnpm test` — run unit/integration tests (Vitest; api integration uses Testcontainers Postgres)
- `pnpm test:e2e` — run end-to-end tests (Playwright; needs Docker — spins up a Testcontainers Postgres and the API)
- `pnpm lint` / `pnpm typecheck` — static checks (ESLint / tsc)
- `pnpm audit` — dependency vulnerability audit (fails on high-severity or worse)
- `pnpm format` / `pnpm format:write` — Prettier check / write
- `pnpm --filter @teambrewer/api db:migrate` — apply database migrations (`prisma migrate dev`)
- `pnpm --filter @teambrewer/api db:generate` — regenerate the Prisma client
- `pnpm --filter @teambrewer/api db:seed` — seed the network-free reference catalog (games + formats)
- `pnpm --filter @teambrewer/api card:sync` — sync card data from the sanctioned open source (all games, or
  one: `card:sync <gameId>`); requires a built API (`pnpm --filter @teambrewer/api build`) since it runs `dist/`
- `pnpm --filter @teambrewer/api bootstrap:local` — idempotently ensure the local instance-admin exists and
  print its setup link (identity from `SEED_ADMIN_*`); requires a built API. Normally invoked by `pnpm start`.
- `docker compose up --build` — run the full self-hosted stack (web on `WEB_PORT`, default 8080)

Keep this section in sync with reality as phases land.
