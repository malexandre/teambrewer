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

The knowledge base and the phased implementation plan are complete. **Phase-00 (foundation) is done:**
the pnpm monorepo, strict TypeScript, lint/format, the Vitest + Testcontainers + Playwright test harness,
Prisma 7 with an empty base migration, the NestJS API (`GET /api/health`), the React + Vite PWA shell, and
the Docker Compose stack (Postgres + API + Nginx) all exist and pass locally.

**Phase-01 (auth & tenancy) is ✅ done** (merged to `main`): the identity/tenancy models + migration;
**Better Auth** (password + mandatory TOTP + backup codes, invite-only, no-email) and the **Discord** login
method; the **tenant-isolation backbone** (`TeamContextGuard` + `TeamScopedPrisma`) and the management-side
**`TeamAdminGuard`**; the admin, onboarding-link, and self endpoints; rate limiting; and the auth/teams
**frontend**.

**Phase-02 (card database) is ✅ done** on branch `phase-02-card-database`. Delivered and tested (all
local-green: 132 API + 58 shared + 12 web unit/integration tests + the phase-01 e2e; plus a live proof-sync
of the real the-fab-cube v8.2.0 dataset → 4862 cards / 145 heroes, idempotent): the finalized **`GameAdapter`**
seam + registry with the **Flesh and Blood** reference adapter; global per-game reference models
(`Game`/`Format`/`Hero`/lean `Card`/`CardDataVersion`); the idempotent **card sync** (`CardSyncService` +
`card:sync` CLI + env-gated cron) importing the-fab-cube (pinned release tag), plus the network-free
`db:seed`; game-filtered **endpoints** (`/api/cards` search with keyset pagination, `/api/cards/:id`,
`/api/formats`, `/api/heroes`, `/api/card-data/version`, instance-admin `/api/admin/card-data/sync`); and the
**frontend** cards feature (`CardPicker`, `CardPreview`, data-version badge, hooks, a Cards page). **Decision
recorded:** the `Card` model is **lean** (name + pitch + image only — decks are links, the image conveys
stats); `data-model.md` and `card-database.md` were updated to match.

**Phase-03 (decks) is ✅ done** (merged to `main`). Delivered and tested (all local-green: 173 API + 81
shared + 20 web unit/integration tests + 2 e2e journeys): the team-owned, **link-only** `Deck` and
`DeckIterationEntry` models + migration (ADR-0002 — no stored card list); the **`DecksModule`** — the first
real consumer of `TeamScopedPrisma` — with team-scoped CRUD, the dedicated status endpoint enforcing a
**permissive status lifecycle** (transition map single-sourced in `packages/shared`), ownership +
team-admin moderation, `private`/`team` visibility (404 to avoid enumeration), cross-game `formatId`/`heroId`
rejection, the append-only iteration log, and best-effort **Fabrary URL recognition** via the game adapter
(metadata only, no scraping — ADR-0007); endpoints `GET/POST /api/decks`, `GET/PATCH/DELETE
/api/decks/:deckId`, `PATCH /api/decks/:deckId/status`, `GET/POST /api/decks/:deckId/iteration-entries`,
`POST /api/decks/recognize-url`; and the mobile-first **frontend** decks feature (list/detail/form, status
+ visibility controls, iteration log, hero/format pickers, team-scoped hooks). **Fix:** `TeamScopedPrisma`
now resolves the team context **lazily** (a request-scoped controller is instantiated before its guards
run). **Doc updated:** the `decks.md` status mermaid now matches the permissive prose.

**Phase-04 (collaboration core) is ✅ done** (merged to `main`). Delivered and tested (all local-green: 201
API + 110 shared + 23 web unit/integration tests + 3 e2e journeys): the shared, **polymorphic**
collaboration subsystem — threaded **comments**, **@mentions → notifications**, an **activity feed**, and an
in-app **notification center** (no email/push — ADR-0003) — plus a reusable **attach pattern** so any module
becomes commentable + activity-tracked by declaring a `subjectType`. Backend: `Comment`/`Mention`/
`Notification`/`ActivityEvent` models + migration (subject_type/type/verb are plain strings, extended as
modules adopt); the **`AttachableSubjectResolver` + `SubjectResolverRegistry`** contract (collaboration never
depends on the modules it serves); `CollaborationModule` (comments CRUD + single-level threading +
author/team-admin moderation, mention parsing → in-team `Mention` + `Notification`, the notification center,
and the per-subject/team activity feed) — all team-scoped via `TeamScopedPrisma` (`comment`/`notification`/
`activityEvent` added to `TEAM_OWNED_MODELS`); and the **decks retrofit** (deck registered as the first
subject; `deck_created`/`deck_updated`/`deck_status_changed` + `commented` activity). **Privacy decision:**
private-deck activity is never recorded to the team-wide feed (the resolver's `isTeamVisible`), so a personal
draft's existence can't leak. **Scope decision (with the user):** notifications are **mentions-only** this
phase; the `type` enum stays open for reply/authored notifications later. Endpoints `GET/POST /api/comments`,
`PATCH/DELETE /api/comments/:commentId`, `GET /api/notifications`, `PATCH /api/notifications/:id/read`,
`POST /api/notifications/read-all`, `GET /api/activity`. Frontend: `CommentThread` (nested replies,
in-team-only @-autocomplete, inline edit/remove), `NotificationCenter` (header bell + unread badge), and
`ActivityFeed` (a `/activity` route + a per-deck section on `DeckDetail`).

**Phase-05 (events & gauntlets) is ✅ done** (merged to `main`). Delivered and tested (all local-green: 243
API + 147 shared + 31 web unit/integration tests + 4 e2e journeys): the **Event** as the central organizing
hub (ADR-0004). Backend `EventsModule` — team-scoped **events** CRUD (keyset pagination; `status`/`formatId`/
`importance` filters; status advanced **through `PATCH`** with a guarded lifecycle `upcoming → active →
completed → archived` + cancellation, illegal → `422`; `DELETE` archives via `archivedAt`), the **gauntlet**
(exactly-one target form — reference deck / hero / archetype label; raw `expectedMetaShare` 0–100; reference-
deck must be the team's own `isReference` deck; cross-game hero rejection; duplicate-target `422`), and
idempotent per-member **attendance** (`PUT .../attendance/me`). Models `Event`/`GauntletEntry`/`Attendance` +
migration; `event`/`gauntletEntry` added to `TEAM_OWNED_MODELS` (attendance is scoped transitively through
its parent event — no `teamId`). Endpoints `GET/POST /api/events`, `GET/PATCH/DELETE /api/events/:eventId`,
`GET/POST /api/events/:eventId/gauntlet-entries`, `PATCH/DELETE .../:gauntletEntryId`,
`GET /api/events/:eventId/attendance`, `PUT .../attendance/me`. Frontend `events` feature — list + filters,
the **event hub** (header, status control, gauntlet builder with a share bar + running total, attendance
toggle + roster), create/edit form, team-scoped hooks. **Decision (with the user):** events & gauntlets are a
**shared team board** — any member creates/edits/deletes any event or gauntlet entry (no owner column);
`data-model.md`'s `Event` has no owner field, and `multi-tenancy.md` + `events-and-gauntlets.md` were updated
to record it. **Collaboration attach on events is deferred** (not in phase-05 scope). Next: **phase-06 (game
logging)** — pick it up per [`docs/plans/`](docs/plans/README.md).

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
- `pnpm dev` — run web + api in watch mode
- `pnpm build` — build all packages (shared → api/web, topological)
- `pnpm test` — run unit/integration tests (Vitest; api integration uses Testcontainers Postgres)
- `pnpm test:e2e` — run end-to-end tests (Playwright; needs Docker — spins up a Testcontainers Postgres and the API)
- `pnpm lint` / `pnpm typecheck` — static checks (ESLint / tsc)
- `pnpm format` / `pnpm format:write` — Prettier check / write
- `pnpm --filter @teambrewer/api db:migrate` — apply database migrations (`prisma migrate dev`)
- `pnpm --filter @teambrewer/api db:generate` — regenerate the Prisma client
- `pnpm --filter @teambrewer/api db:seed` — seed the network-free reference catalog (games + formats)
- `pnpm --filter @teambrewer/api card:sync` — sync card data from the sanctioned open source (all games, or
  one: `card:sync <gameId>`); requires a built API (`pnpm --filter @teambrewer/api build`) since it runs `dist/`
- `docker compose up --build` — run the full self-hosted stack (web on `WEB_PORT`, default 8080)

Keep this section in sync with reality as phases land.
