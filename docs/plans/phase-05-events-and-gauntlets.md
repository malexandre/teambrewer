# Phase 05 — Events & Gauntlets

## Goal

Make the **Event** the central organizing hub of the app. Deliver team-scoped events (format, date,
importance, status), each with a **gauntlet** (the field to beat, weighted by expected metagame share) and
member **attendance** (RSVP). This is the backbone later modules (game logging, matchups, coverage, test
assignments, game-plans, deck selection) reference. No aggregation math yet — this phase only captures the
structure.

## Depends on

- [phase-03-decks.md](phase-03-decks.md) — gauntlet entries may reference a reference `Deck` (`isReference`),
  and events use `Format`/`gameId` established via decks and the card database.

(Matches the roadmap dependency graph: `p03 --> p05`.)

## Implements

- Feature spec: [../features/events-and-gauntlets.md](../features/events-and-gauntlets.md)
- Decision: [../decisions/0004-event-centric.md](../decisions/0004-event-centric.md)
- Architecture: [../architecture/data-model.md](../architecture/data-model.md#events--gauntlets) ·
  [../architecture/multi-tenancy.md](../architecture/multi-tenancy.md) ·
  [../architecture/api-conventions.md](../architecture/api-conventions.md) ·
  [../architecture/frontend.md](../architecture/frontend.md)
- Domain: [../domain/playtesting-methodology.md](../domain/playtesting-methodology.md) (§3, §6)

## Scope

- **`Event`** entity: `{ id, teamId, name, formatId, date, location?, importance, description, status }`.
  - `importance` enum ordinal: `local | regional | national | major`.
  - `status` enum with a guarded state machine: `upcoming → active → completed → archived`, plus
    `upcoming → archived` and `active → archived` (cancelled). Illegal transitions return `422`.
- **`GauntletEntry`** entity: `{ id, eventId, teamId, referenceDeckId? | heroId? | archetypeLabel?,
  expectedMetaShare (0–100), notes }`. Exactly one target form per entry.
- **`Attendance`** entity: `{ id, eventId, userId, status: going | maybe | not_going }`, one row per member
  per event (idempotent upsert).
- Team-scoped CRUD for all three, verified server-side from `TeamContextGuard`.
- Expected-metagame share captured per entry (0–100), stored raw; normalization into weights is deferred to
  the consumers (coverage/dashboard) — this phase only persists and validates it.
- Frontend: an **event hub page** (header + gauntlet + attendance), a **gauntlet builder**, and an **RSVP**
  control.

## Deliverables

- Prisma models `Event`, `GauntletEntry`, `Attendance` + a migration, each with a composite `(teamId, ...)`
  index; `Attendance` unique on `(eventId, userId)`.
- Zod schemas in `packages/shared` for create/update/response of each entity (importance, status, RSVP
  status, and the gauntlet target-form union), with DTO types inferred via `z.infer`.
- NestJS `EventsModule` (controller + service + Prisma access) covering every endpoint in the feature spec's
  API surface, all queries filtered by verified `teamId`.
- An event **status-transition** helper (single place, table of legal transitions).
- Frontend `events` feature folder under `apps/web/src/features/events/` — event list, event hub/detail
  page, gauntlet builder, expected-metagame share bar, and the attendance toggle + roster.
- Tests at every level per the testing strategy (see below).

## Task checklist (test-first, ordered)

- [ ] Write failing Zod schema tests in `packages/shared` for `Event`, `GauntletEntry`, `Attendance`
      (valid + invalid payloads), then add the schemas to make them pass.
- [ ] Write a failing unit test for the event status-transition helper (legal vs illegal transitions),
      then implement the helper.
- [ ] Write a failing unit test for the gauntlet target-form rule (exactly one of
      `referenceDeckId`/`heroId`/`archetypeLabel`) and `expectedMetaShare ∈ [0,100]`, then implement.
- [ ] Add the Prisma models + migration; run `pnpm --filter api prisma migrate dev`.
- [ ] Write failing integration tests for `Event` CRUD scoped to a team, then implement the service +
      controller.
- [ ] Write failing integration tests for `GauntletEntry` CRUD (variants: reference deck / hero /
      archetype label; duplicate-target rejection `422`; cross-team reference-deck rejection), then
      implement.
- [ ] Write failing integration tests for `Attendance` upsert idempotency (`PUT .../attendance/me`), then
      implement.
- [ ] Write failing **tenant-isolation** integration tests (team A cannot read/write team B's events,
      gauntlet entries, attendance; forged `teamId`; cross-team FK), then confirm they pass.
- [ ] Write failing component tests for the gauntlet builder (share validation, running-total display,
      target-form selection) and the RSVP toggle, then build the UI.
- [ ] Wire the frontend `events` feature to the API with team-scoped TanStack Query keys `[teamId, ...]`.
- [ ] Update [README.md](README.md) status table and this phase's cross-links.

## Tests & verification

**Unit**
- Status-transition helper: every legal transition accepted; every illegal one rejected (`422`).
- Gauntlet validation: `expectedMetaShare` at `-1`, `0`, `100`, `101` → reject the out-of-range values;
  zero, one, and two target forms → only exactly-one accepted.

**Integration (Vitest + test Postgres)**
- Event/gauntlet/attendance CRUD happy paths return the right status codes (201/200/204) and envelopes.
- Filtering: `GET /api/events?status=&formatId=&importance=` returns the expected subset.
- Duplicate gauntlet target within one event → `422`.
- `PUT /api/events/:eventId/attendance/me` twice → a single row (idempotent upsert).
- **Tenant isolation (mandatory):** a team-A user hitting a team-B event/entry/attendance id gets `404`
  (never leaking existence); a forged `X-Team-Id` the user is not a member of gets `403`; a gauntlet entry
  referencing a team-B reference deck is rejected.

**Component**
- Gauntlet builder validates share input and shows the running total; RSVP toggle reflects the current
  user's status.

**End-to-end proof (commands)**
1. `pnpm --filter api prisma migrate dev` — migration applies cleanly.
2. `pnpm test` — unit + integration + component green.
3. `pnpm test:e2e` — a Playwright journey: sign in → create an event → add three gauntlet entries (one
   reference deck, one hero, one archetype label) → RSVP *going* → the event hub shows the field share bar
   and the roster.
4. `pnpm lint && pnpm typecheck` — clean.

## Out of scope

- **Deck selection & retrospective** (also keyed to the event) — [phase-09-gameplans-and-deck-selection.md](phase-09-gameplans-and-deck-selection.md).
- **Game logging** against the field — [phase-06-game-logging.md](phase-06-game-logging.md).
- **Matchup aggregation, coverage math, trust indicators** — [phase-07-matchups-and-coverage.md](phase-07-matchups-and-coverage.md).
- **Test assignments** driven by the gauntlet — [phase-08-testing-queue.md](phase-08-testing-queue.md).
- Auto-normalizing shares into weights; external event calendars/imports; automatic metagame feeds
  (`expectedMetaShare` is entered by the team).

## See also

- Feature: [../features/events-and-gauntlets.md](../features/events-and-gauntlets.md) ·
  [../features/decks.md](../features/decks.md) ·
  [../features/game-logging.md](../features/game-logging.md) ·
  [../features/confidence-and-matchups.md](../features/confidence-and-matchups.md) ·
  [../features/gameplans-and-deck-selection.md](../features/gameplans-and-deck-selection.md)
- Decisions: [../decisions/0004-event-centric.md](../decisions/0004-event-centric.md) ·
  [../decisions/0002-decks-as-links.md](../decisions/0002-decks-as-links.md) ·
  [../decisions/0008-multi-tenant-teams.md](../decisions/0008-multi-tenant-teams.md)
- Architecture: [../architecture/data-model.md](../architecture/data-model.md) ·
  [../architecture/multi-tenancy.md](../architecture/multi-tenancy.md) ·
  [../architecture/api-conventions.md](../architecture/api-conventions.md) ·
  [../architecture/frontend.md](../architecture/frontend.md) ·
  [../architecture/testing-strategy.md](../architecture/testing-strategy.md)
- Domain: [../domain/playtesting-methodology.md](../domain/playtesting-methodology.md) ·
  [../domain/flesh-and-blood.md](../domain/flesh-and-blood.md)
- Phases: [phase-03-decks.md](phase-03-decks.md) · [phase-06-game-logging.md](phase-06-game-logging.md) ·
  [phase-07-matchups-and-coverage.md](phase-07-matchups-and-coverage.md) ·
  [phase-09-gameplans-and-deck-selection.md](phase-09-gameplans-and-deck-selection.md)
- Skills: [../../.claude/skills/implementing-a-phase/SKILL.md](../../.claude/skills/implementing-a-phase/SKILL.md) ·
  [../../.claude/skills/adding-a-feature-module/SKILL.md](../../.claude/skills/adding-a-feature-module/SKILL.md)
</content>
</invoke>
