# Phase 07 — Matchups & Coverage

## Goal

Turn logged games into trustworthy, self-explaining matchup reads. Build the **matchup aggregation service**
(confidence-weighted win rate, **raw N always shown**, effective sample, bucketed trust indicator) scoped by
team/format/event and computable **by deck and by hero**; render a responsive **matchup matrix**; and
provide a **coverage tracker** that surfaces which gauntlet matchups are still under-tested and who is
assigned to them. `GameLog` is the source of truth (materialization may come later).

## Depends on

- [phase-05-events-and-gauntlets.md](phase-05-events-and-gauntlets.md) — coverage is measured against an
  event's gauntlet and its expected metagame shares.
- [phase-06-game-logging.md](phase-06-game-logging.md) — aggregation reads `GameLog` and its
  `confidenceWeight`.

(Matches the roadmap dependency graph: `p05 --> p07`, `p06 --> p07`.)

## Implements

- Feature spec: [../features/confidence-and-matchups.md](../features/confidence-and-matchups.md)
- Decision: [../decisions/0005-confidence-weight-model.md](../decisions/0005-confidence-weight-model.md)
- Architecture: [../architecture/data-model.md](../architecture/data-model.md#game-logging--matchups) ·
  [../architecture/multi-tenancy.md](../architecture/multi-tenancy.md) ·
  [../architecture/api-conventions.md](../architecture/api-conventions.md) ·
  [../architecture/frontend.md](../architecture/frontend.md)
- Domain: [../domain/playtesting-methodology.md](../domain/playtesting-methodology.md) (§1–§3)

## Scope

- **Matchup aggregation service** — a pure computation over the relevant `GameLog`s for a
  `(our side, opponent side, format, [event])` pairing:
  - **Weighted win rate** = `Σ(weightᵢ · winᵢ) / Σ(weightᵢ)`.
  - **Raw N** = count of games — **always returned and always displayed**.
  - **Effective sample** = `Σ(weightᵢ)`.
  - **Trust indicator** = low/medium/high bucket derived from effective sample (finalize thresholds here,
    per ADR-0005, in one well-tested place).
  - Computable **by deck** and **by hero**; scoped by team, filterable by format and optional event.
  - Correctly attributes wins to the right side using `result`, `bestOf`, and `firstPlayerSide` where relevant
    (respect first/second player only as data, not as a separate axis in v1 unless the feature spec requires it).
- **Matchup matrix UI** — our decks/heroes × opponent field; each cell shows weighted win rate, **raw N**,
  and the trust indicator; responsive (horizontal scroll / condensed view on mobile).
- **Coverage tracker** — for a given event's gauntlet, flag matchups whose effective sample or raw N is
  **below a configurable threshold**, ordered by expected metagame share (normalized), and show who is
  assigned (linking out to test assignments from [phase-08-testing-queue.md](phase-08-testing-queue.md) when
  present; degrade gracefully if that module is not yet built).

## Deliverables

- A **pure aggregation module** (candidate: `packages/shared` or `apps/api` domain layer) with
  `aggregateMatchup(...)` and the `trustIndicator(effectiveSample)` bucketing — no I/O, fully unit-tested.
- A NestJS matchups/coverage service + controller reading `GameLog` scoped by verified `teamId`, exposing:
  matchup matrix data, a single matchup detail, and coverage for an event. Cursor pagination / filters per
  [api-conventions](../architecture/api-conventions.md).
- Zod schemas in `packages/shared` for the matchup-cell, matrix, and coverage responses (each including
  `rawN`, `weightedWinRate`, `effectiveSample`, `trustIndicator`).
- Frontend `matchups` feature folder: the responsive matrix, a matchup-detail view, and the coverage tracker
  with a configurable threshold control.
- Full test suite with crafted `GameLog` datasets producing **known expected numbers** (see below).

## Task checklist (test-first, ordered)

- [x] Write failing unit tests for `trustIndicator(effectiveSample)` at each bucket boundary, then
      implement the bucketing (lock the finalized ADR-0005 thresholds).
- [x] Write failing unit tests for `aggregateMatchup` using **crafted datasets → known expected**
      weighted win rate, raw N, and effective sample (include a small/low-weight sample that yields a high
      win rate but **low trust**), then implement the aggregation.
- [x] Write failing unit tests for **by-deck vs by-hero** grouping producing the correct partitions, then
      implement grouping.
- [x] Write failing unit tests for coverage threshold logic (which gauntlet matchups fall below a given
      sample/confidence threshold; ordering by normalized expected share), then implement.
- [x] Write failing integration tests for the matrix/detail/coverage endpoints (team-scoped queries,
      format/event filters), then implement the service + controller.
- [x] Write failing **tenant-isolation** integration tests (team A's aggregates never include team B's
      `GameLog`s; cross-tenant event/deck ids → `404`), then confirm.
- [x] Write failing component tests for the matrix (raw N + trust always visible; mobile horizontal scroll)
      and the coverage tracker (threshold control changes the flagged set), then build the UI.
- [x] Wire the frontend with team-scoped TanStack Query keys; link coverage rows to assignments when
      [phase-08-testing-queue.md](phase-08-testing-queue.md) exists.
- [x] Update [README.md](README.md) status table and cross-links.

## Tests & verification

**Aggregation math (signature — call out explicitly)**
- Crafted dataset example: 5 games, weights `[1.0, 1.0, 0.5, 0.5, 0.2]`, wins `[1,0,1,0,1]` →
  weighted win rate = `(1.0+0.5+0.2)/(1.0+1.0+0.5+0.5+0.2) = 1.7/3.2 ≈ 0.531`, raw N = 5, effective
  sample = 3.2. Assert all three exactly, plus the trust bucket for 3.2.
- A single 1.0-weight win → win rate 1.0, raw N 1, effective sample 1.0, **low** trust (high rate must read
  as untrusted over a tiny sample).
- Zero games → defined empty result (no division by zero), raw N 0, `low`/none trust.
- By-hero aggregation groups multiple decks of the same hero together; by-deck keeps them separate.

**Coverage**
- Given games + a gauntlet, assert exactly which matchups fall below the configured threshold and that they
  are ordered by normalized expected metagame share.

**Integration (Vitest + test Postgres)**
- Matrix/detail/coverage endpoints return correct numbers over seeded logs; format/event filters narrow the
  set correctly.
- **Tenant isolation (mandatory):** team-A aggregates exclude team-B logs entirely; a forged `X-Team-Id`
  → `403`; cross-tenant event/deck reference → `404`.

**Component**
- Every matrix cell renders raw N and the trust indicator alongside the win rate; the matrix scrolls
  horizontally on a phone viewport; changing the coverage threshold re-flags rows.

**End-to-end proof (commands)**
1. `pnpm test` — unit (aggregation + trust + coverage tables) + integration + component green.
2. `pnpm test:e2e` — Playwright: seed games → open the matrix (raw N + trust visible) → open coverage for an
   event and confirm a thin matchup is flagged.
3. `pnpm lint && pnpm typecheck` — clean.

## Out of scope

- **Test assignments** themselves — [phase-08-testing-queue.md](phase-08-testing-queue.md) (coverage links
  to them).
- **Game-plans and deck selection** — [phase-09-gameplans-and-deck-selection.md](phase-09-gameplans-and-deck-selection.md).
- Dashboard-level "what to test next" recommendations across events — phase-11.
- Statistical confidence intervals (deferred per ADR-0005); materialized matchup tables (may come later —
  source of truth stays `GameLog`).

## See also

- Feature: [../features/confidence-and-matchups.md](../features/confidence-and-matchups.md) ·
  [../features/game-logging.md](../features/game-logging.md) ·
  [../features/events-and-gauntlets.md](../features/events-and-gauntlets.md) ·
  [../features/testing-queue.md](../features/testing-queue.md)
- Decisions: [../decisions/0005-confidence-weight-model.md](../decisions/0005-confidence-weight-model.md) ·
  [../decisions/0004-event-centric.md](../decisions/0004-event-centric.md) ·
  [../decisions/0008-multi-tenant-teams.md](../decisions/0008-multi-tenant-teams.md)
- Architecture: [../architecture/data-model.md](../architecture/data-model.md) ·
  [../architecture/multi-tenancy.md](../architecture/multi-tenancy.md) ·
  [../architecture/api-conventions.md](../architecture/api-conventions.md) ·
  [../architecture/frontend.md](../architecture/frontend.md) ·
  [../architecture/testing-strategy.md](../architecture/testing-strategy.md)
- Domain: [../domain/playtesting-methodology.md](../domain/playtesting-methodology.md) ·
  [../domain/flesh-and-blood.md](../domain/flesh-and-blood.md)
- Phases: [phase-05-events-and-gauntlets.md](phase-05-events-and-gauntlets.md) ·
  [phase-06-game-logging.md](phase-06-game-logging.md) ·
  [phase-08-testing-queue.md](phase-08-testing-queue.md) ·
  [phase-09-gameplans-and-deck-selection.md](phase-09-gameplans-and-deck-selection.md)
- Skills: [../../.claude/skills/implementing-a-phase/SKILL.md](../../.claude/skills/implementing-a-phase/SKILL.md) ·
  [../../.claude/skills/adding-a-feature-module/SKILL.md](../../.claude/skills/adding-a-feature-module/SKILL.md)
