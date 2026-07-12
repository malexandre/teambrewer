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
to record it. **Post-phase follow-up (with the user):** events were then retrofitted onto the collaboration
subsystem — `event` is a commentable subject (`EventSubjectResolver`), the hub renders the shared
`CommentThread` + `ActivityFeed`, and create/update/status-change emit `event_created`/`event_updated`/
`event_status_changed` activity (shared `subjectType`/`activityVerb` enums extended).

**Phase-06 (game logging) is ✅ done** (merged to `main`). Delivered and tested (all local-green: 271 API +
176 shared + 38 web unit/integration tests + 5 e2e journeys): the **`GameLog`** as the confidence-weighted
source of truth for every matchup aggregate (ADR-0005, finalized this phase). The signature decision is the
**confidence-weight model** — four 3-level factor enums (`skillParity`/`seriousness`/`deckMaturity`/
`pilotFamiliarity`) each mapping to a `1.0`/`0.7`/`0.4` sub-score, combined by the pure
**`deriveConfidenceWeight`** (in `packages/shared`, so the API derives it authoritatively and the web form
previews it live) as a **weighted mean** (`0.35`/`0.25`/`0.25`/`0.15`); all-best → `1.0`, all-worst → the
documented `0.40` floor, always within `[0,1]`, locked by table-driven tests. Backend `GameLogsModule` —
team-scoped CRUD, `sideA` (our pilot+deck) / `sideB` (teammate **or** external opponent via exactly one of
reference deck / hero / archetype), result↔best-of consistency, cross-team deck/event + cross-game
format/hero FK rejection, logger/team-admin ownership (404-before-403), `archivedAt` soft-delete, keyset
pagination + filters (`formatId`/`eventId`/`deckId`/`heroId`/`pilotUserId`, matching either side); the
`GameLog` model + migration (`gameLog` added to `TEAM_OWNED_MODELS`); and the collaboration retrofit
(`game_log` subject + `game_log_created`/`game_log_updated` activity). Endpoints `GET/POST /api/game-logs`,
`GET/PATCH/DELETE /api/game-logs/:gameLogId`. Frontend `game-logging` feature — the **fast mobile logging
form** (deck + opponent-kind pickers, big result buttons / games-won steppers, confidence factors as
segmented controls pre-filled with defaults, a live "counts as ~0.78" hint, optional details behind a
disclosure), the list + the detail hub (matchup, weight + factors, shared `CommentThread` + `ActivityFeed`).
**Decisions (with the user):** the weight combination is a weighted mean and `deriveConfidenceWeight` lives
in `packages/shared`; trust-indicator buckets are deferred to phase-07. **Notes:** result/best-of and
sideB-identity violations surface as `400` at the schema boundary (the events convention; DB-dependent
domain rules stay `422`); the game-logging e2e runs on a **phone-viewport Playwright project**.
**Post-phase follow-up (game-logging v2, on branch `feat/game-logging-wizard`):** the single-screen form was
replaced by a **`GameLogWizard`** — a 3-step fast path (matchup → result → confidence, with its live "counts
as ~0.XX" hint and the primary **Log game** button) plus an optional step 4 for notes and card capture, used
on every viewport, reusing the same wizard for edit. The pre-selected `bestOf` is now **game-driven**: a new
`readonly defaultBestOf: BestOf` on the `GameAdapter` (FaB → `1`) resolved through the new team-scoped
**`GET /api/game-config`** seam (`{ gameId, identityLabel, defaultBestOf }`, shared `gameConfigSchema`) that
the wizard reads via `useGameConfig`; `bestOf` itself stays a required, client-supplied field. Logs can also
capture optional **impressive/underperforming cards**, each tagged ours/theirs, via the new
**`GameLogCard`** model (scoped transitively through its parent `GameLog`, like `Attendance` on `Event`) and
`impressiveCards[]`/`underperformingCards[]` on create/update (update replaces the set per role); cross-game
`cardId` is rejected.

**Phase-07 (matchups & coverage) is ✅ done** (merged to `main`). Delivered and tested (all local-green: 294
API + 211 shared + 44 web unit/integration tests + 6 e2e journeys): the signature **confidence-weighted
matchup reads**, derived read-only from `GameLog` (still the source of truth — no materialized table). The
math is pure and single-sourced in `packages/shared` (`aggregateMatchup`, `trustIndicator`,
`deriveGameOutcome`, coverage helpers) next to `deriveConfidenceWeight`: **weighted win rate**
`Σ(w·win)/Σ(w)`, **raw N** (always shown), **effective sample** `Σ(w)`, and a **trust indicator**. Backend
read-only **`MatchupsModule`** — `GET /api/matchups` (list), `/api/matchups/matrix` (our decks/heroes × the
opponent field), `/api/matchups/coverage` (an event's gauntlet coverage) — reads team-scoped `GameLog`s via
`TeamScopedPrisma`, groups **by deck** or **by hero**, resolves deck/hero identities, and validates
`formatId`/`eventId`/`ourDeckId` (cross-tenant → 404, forged team → 403). Frontend **`matchups`** feature:
the responsive `MatchupMatrix` (sticky first column + horizontal scroll; every cell shows rate + raw N + a
trust badge, styled tentative below `high`), the `CoverageTracker` (thin gauntlet matchups ordered by
normalized field share, with a threshold control), and scope selectors + a by-deck/by-hero toggle.
**Decisions (with the user), recorded in ADR-0005:** a **draw** counts in raw N but is **excluded** from the
weighted win rate and the effective sample; **trust thresholds** are `low <5 · medium 5–<15 · high ≥15`;
coverage aggregates all relevant reps in the event's **format** against each target, flagging effective
sample below a configurable threshold (default the `high` boundary). `firstPlayerSide` is data, not an
aggregation axis (v1). Test assignments (`assignments: []`) arrive with phase-08.

**Phase-08 (testing queue) is ✅ done** (merged to `main`). Delivered and tested (all local-green: 361 API +
243 shared + 53 web unit/integration tests + 7 e2e journeys): the deliberate-testing subsystem — per-deck
**card-test suggestions** with **upvotes**, and **test assignments** that hand a specific matchup to a
member. Backend **`TestingQueueModule`** (team-scoped via `TeamScopedPrisma`): **`CardTestSuggestion`** CRUD
(`GET/POST /api/card-test-suggestions`, `PATCH/DELETE /:suggestionId`) with a guarded lifecycle
`proposed → testing → adopted | rejected` (illegal → 422; resolving to adopted/rejected requires a
`resolutionNote`), author/team-admin ownership (404-before-403), archived-deck-blocks-create, and
cross-team/cross-game FK rejection; **upvote-only voting** (`PUT/DELETE /:suggestionId/votes/me`, idempotent
upsert on `(suggestionId, userId)`, voter from context — `SuggestionVote` has no `value` and no `teamId`,
scoped transitively like `Attendance`); and **`TestAssignment`** CRUD (`GET/POST /api/test-assignments`,
`PATCH/DELETE /:assignmentId`) with an exactly-one-of opponent (gauntlet entry / hero / archetype label; the
structural rule → 400), a guarded lifecycle `open → in_progress → done` (+`cancelled`), creator/assignee/
admin ownership, and a server-derived **`opponentSnapshotLabel`** that survives deletion of the referenced
gauntlet entry/hero. Both are collaboration subjects (`card_test_suggestion`/`test_assignment`) emitting
created/updated/status_changed activity. Models `CardTestSuggestion`/`SuggestionVote`/`TestAssignment` +
migration; `cardTestSuggestion`/`testAssignment` added to `TEAM_OWNED_MODELS`. Frontend **`testing-queue`**
feature: a per-deck **`SuggestionBoard`** (grouped by status, one-tap voting, status control with the
required resolution note, on-demand discussion) embedded on `DeckDetail`, and an **`/assignments`** page
(assign a matchup, "All / Assigned to me" scope, status control, discussion). **Decisions (with the user):**
votes are **upvote-only** (no `value`); assignment statuses use the feature-spec vocabulary
**`open/in_progress/done`** (+`cancelled`); the opponent snapshot is implemented now (not deferred).

**Phase-09 (game-plans & deck selection) is ✅ done** (merged to `main`). Delivered and tested (all
local-green: 389 API + 269 shared + 60 web unit/integration tests + 8 e2e journeys): the endgame that turns
testing into decisions (ADR-0004). Backend new **`GamePlansModule`** — team-scoped **`MatchupGamePlan`** CRUD
(`GET/POST /api/game-plans`, `GET/PATCH/DELETE /api/game-plans/:gamePlanId`): one canonical plan per
`(teamId, ourDeckId, opponentRef, formatId)` (duplicate create → `409`; edit updates in place + re-stamps
`updatedBy`), a polymorphic opponent (gauntlet entry / hero / archetype label) persisted as three nullable
columns **plus a derived normalized `opponentRef` key** (`gauntlet:`/`hero:`/`label:`) so uniqueness holds
across the target, and a derived `opponentSnapshotLabel`; `keyCards[]` are a transitively-scoped child model
**`MatchupGamePlanCard`** (replacement set, validated against the team's game); shared team knowledge (any
member creates/edits, **archive team-admin only**); a `matchup_game_plan` collaboration subject emitting
`matchup_game_plan_created/_updated` activity. Two event sub-resources were **added to the existing
`EventsModule`** (decision with the user): per-member **`DeckSelection`** (`GET .../deck-selections`,
`PUT .../deck-selections/me` upsert, `PATCH .../deck-selections/:id/lock|/unlock`) — no `teamId` (scoped
through its event, like `Attendance`), **team-admin-only lock/unlock** (non-admin → `403`), a locked member
edit → `422` — and the post-event **`Retrospective`** (`GET/POST/PATCH .../retrospective`), one per event
(duplicate → `409`), any member authors, author-or-admin edits, admin-only archive. Models
`MatchupGamePlan`/`MatchupGamePlanCard`/`DeckSelection`/`Retrospective` + migration; `matchupGamePlan`/
`retrospective` added to `TEAM_OWNED_MODELS`. Frontend: a **`gameplans`** feature (editor with a hero/
archetype opponent picker, key-card autocomplete + strip, `GamePlanCard` with `CardPreview` + comments)
embedded **only on `DeckDetail`** (decision with the user); and **`DeckSelectionSection`** (my-pick + lock
badge + roster with admin lock/unlock + a format-mismatch warning) + **`RetrospectiveSection`** on the event
hub. **Decisions (with the user):** bodies render as **plain `whitespace-pre-wrap` text** (no markdown-
renderer dependency — the codebase convention); deck-selections/retrospectives live in `EventsModule`;
game-plans are surfaced only on the deck page this phase (the matchup-matrix-cell link is a later follow-up).

**Phase-10 (team knowledge) is ✅ done** (merged to `main`). Delivered and tested (all local-green: 448 API
+ 307 shared + 64 web unit/integration tests + 9 e2e journeys): the team's durable memory — long-form
**primers**, a **decisions log**, and **polls** — all strictly team-scoped and (primers/decisions)
commentable via the collaboration core. Backend three modules under `apps/api/src/knowledge/`: **primers**
(team-scoped CRUD, `team`/`private` visibility — a private draft is readable/editable only by its author +
team-admins, list excludes others' private, single read 404; any member edits a visible primer, author or
team-admin archives; `relatedDeckId` validated same-team → 422; `primer` collaboration subject with private
drafts kept off the activity feed); **decisions** (append-oriented CRUD with **no delete**; a polymorphic
`relatedSubjectRef` — `{subjectType, subjectId}` reusing the collaboration addressing — resolved + validated
same-team via `TeamScopedPrisma` with a durable snapshot label, cross-team → 404; any member records,
author/team-admin corrects; `decision` collaboration subject); **polls** (single-choice votes with an
**effective status** — a poll past `closesAt` counts as closed even if stored `open`; `PUT/DELETE .../vote`
upserts one vote per `(pollId, userId)`, vote on a closed/expired poll → 422, an `optionId` outside the poll
→ 422; `open↔closed` lifecycle via `PATCH` with a reopen-past-`closesAt` → 422 and options-locked-once-voted
→ 422; author/team-admin manage; per-option counts + percentages computed read-only; polls are
activity-tracked but **not** commentable). Models `Primer`/`Decision`/`Poll`/`PollVote` + migration
(`PollVote` transitively scoped through its parent poll, `@@unique(pollId,userId)`; `primer`/`decision`/
`poll` added to `TEAM_OWNED_MODELS`); poll `options` are an ordered JSON array of `{id,label}`. Endpoints
`GET/POST /api/primers`, `GET/PATCH/DELETE /api/primers/:primerId`, `GET/POST /api/decisions`,
`GET/PATCH /api/decisions/:decisionId`, `GET/POST /api/polls`, `GET/PATCH /api/polls/:pollId`,
`PUT/DELETE /api/polls/:pollId/vote`. Frontend a **`knowledge`** feature at a `/knowledge` hub (tabs:
Primers | Decisions | Polls) — a primers library + detail route (`/knowledge/primers/:id`) with
edit/archive + `CommentThread`, a decisions log with expandable cards + discussion, and a polls board (vote
with live count/percentage bars, retract, close/reopen). **Decision (with the user):** long-form bodies
render as **plain `whitespace-pre-wrap` text** authored in a `<textarea>` — **no markdown editor/sanitizer
dependency** (the codebase convention through phase-09); React escapes text content, so a script-laden body
renders literally (proven by a component test) — the "markdown safety" requirement is met by escaping, not a
sanitizer. `docs/plans/phase-10-team-knowledge.md` and `docs/features/team-knowledge.md` were updated to
record it.

**Phase-11 (dashboard) is ✅ done** (merged to `main`). Delivered and tested (all local-green: 461 API + 315
shared + 72 web unit/integration tests + 10 e2e journeys): the **read/aggregation** landing surface that
answers "what should I do next?" It introduces **no new persisted entity, no migration, no
`TEAM_OWNED_MODELS` change** — it composes the existing events, matchups/coverage, testing-queue,
game-logging, and collaboration services (their modules now `export` their services). The one piece of real
logic is the pure, table-driven **`rankTestingPriorities`** in `packages/shared` (next to the matchup math):
ranks **per opponent archetype** by `priorityScore = normalizedShare × coverageGap`
(`coverageGap = max(0, target − effectiveSample)/target`, `target` defaults to the `high` trust boundary 15),
ordered priority desc → `expectedMetaShare` desc → `effectiveSample` asc → `opponentKey`, with a no-shares
fallback (rank by coverage gap, `sharesUnset` flagged) and empty-gauntlet → `[]`. Backend read-only
**`DashboardModule`** — `GET /api/dashboard/me` (my open+in-progress assignments, nearest-upcoming events
with my RSVP + deck selection, recent results with the outcome from my perspective — flipped when I piloted
side B) and `GET /api/dashboard/team` (target event = explicit `?eventId=` else nearest upcoming; the ranked
recommendation, coverage gaps with current assignees, recent team results, an activity slice) — all
team-scoped through the composed services (a cross-tenant `eventId` → 404, a forged team → 403). Frontend
**`dashboard`** feature at the **authenticated landing `/`** (the team roster moved to a new `/team` route +
nav entry) — a mobile-first, sectioned page with a **For me** / **Team** scope toggle, every widget
deep-linking into its owning feature. **Decisions (with the user):** rank **per opponent archetype** (not
per our-deck × opponent pairing), and make the dashboard the landing route; `docs/features/dashboard.md` +
the phase plan were updated to record both. Next: **phase-12 (riftbound adapter)** — pick it up per
[`docs/plans/`](docs/plans/README.md).

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
