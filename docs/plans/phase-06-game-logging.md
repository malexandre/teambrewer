# Phase 06 — Game Logging

## Goal

Capture individual games/matches with the **structured confidence factors** that make each result
trustworthy, and derive a single `confidenceWeight ∈ [0,1]` from them in **one well-tested place**
([ADR-0005](../decisions/0005-confidence-weight-model.md)). `GameLog` is the source of truth for every
matchup aggregate built later. Because the signature real-world flow is **logging on a phone right after a
game**, the logging form must be fast: pickers, autocomplete, sensible defaults, minimal typing.

## Depends on

- [phase-03-decks.md](phase-03-decks.md) — a game references our team decks (and reference decks / heroes).
- [phase-05-events-and-gauntlets.md](phase-05-events-and-gauntlets.md) — a game may optionally attach an
  `eventId`.

(Matches the roadmap dependency graph: `p03 --> p06`, `p05 --> p06`.)

## Implements

- Feature spec: [../features/game-logging.md](../features/game-logging.md)
- Decision: [../decisions/0005-confidence-weight-model.md](../decisions/0005-confidence-weight-model.md) ·
  [../decisions/0002-decks-as-links.md](../decisions/0002-decks-as-links.md)
- Architecture: [../architecture/data-model.md](../architecture/data-model.md#game-logging--matchups) ·
  [../architecture/multi-tenancy.md](../architecture/multi-tenancy.md) ·
  [../architecture/api-conventions.md](../architecture/api-conventions.md) ·
  [../architecture/frontend.md](../architecture/frontend.md)
- Domain: [../domain/playtesting-methodology.md](../domain/playtesting-methodology.md) (§1) ·
  [../domain/flesh-and-blood.md](../domain/flesh-and-blood.md)

## Scope

- **`GameLog`** entity per the data model:
  `{ id, teamId, loggedById, formatId, eventId?, playedAt,`
  `sideA: { pilotUserId, deckId },`
  `sideB: { pilotUserId? | externalOpponentName?, deckId? | heroId? | archetypeLabel? },`
  `firstPlayerSide, bestOf, result, winType?, lossReason?, learnings,`
  `confidenceFactors: { skillParity, seriousness, deckMaturity, pilotFamiliarity }, confidenceWeight }`.
  - `sideA` is always "our" side (team-member pilot + team deck).
  - `sideB` is a teammate **or** an external opponent identified by reference `deckId`, `heroId`, or
    `archetypeLabel`. At least one opponent identifier required; exactly one of {teammate, external}.
- **The confidence-weight derivation function** (ADR-0005): the four factor enums each map to a 0–1
  sub-score, combined into `confidenceWeight ∈ [0,1]`. Finalize the enum value sets and the combination
  (weighted average vs product) here, in a **single module** consumed by the service. **Always derived
  server-side; a client-supplied weight is ignored.**
- Team-scoped CRUD; ownership rules (logger + team-admin may edit/archive); soft-delete via `archivedAt`.
- Validation: `result` consistent with `bestOf`; sideB opponent-identifier rules; cross-team FK rejection
  (any referenced `deckId`/`eventId` must share `teamId`); `eventId` format-coherence warning (allowed).
- **Fast mobile logging form**: big result buttons / games-won stepper, deck + opponent autocomplete
  (name+pitch for cards, hero list from adapter, recents first), confidence factors as segmented controls
  pre-filled with defaults, optional fields behind a "more details" disclosure, first/second player + best-of toggles.

## Deliverables

- Prisma `GameLog` model + migration (composite `(teamId, ...)` indexes; index the columns aggregates will
  filter on: `formatId`, `eventId`, `deckId`/`heroId`, `pilotUserId`).
- Zod schemas in `packages/shared` for the game-log create/update/response, the `sideA`/`sideB` unions, the
  four `confidenceFactors` enums, `winType`/`lossReason`, `bestOf`, and `result`. `confidenceWeight` appears
  in responses only, never in create/update input.
- A **`deriveConfidenceWeight(confidenceFactors)`** function in one place (candidate: `packages/shared` so
  both API and web can preview it, or `apps/api` if it must stay server-authoritative — pick and document;
  the authoritative derivation runs server-side regardless).
- NestJS `GameLogsModule` (controller + service + Prisma access), all queries filtered by verified `teamId`,
  weight derived on create and re-derived on factor edits.
- Frontend `game-logging` feature folder with the fast mobile form, autocomplete pickers, hover/press card
  preview, and a post-save "this game counts as ~0.7" hint showing the derived weight.
- Full test suite (see below), including the table-driven confidence-weight tests.

## Task checklist (test-first, ordered)

- [x] Write the **table-driven** failing unit tests for `deriveConfidenceWeight`: enumerate factor
      combinations → expected weight; assert every output is within `[0,1]`; assert the "all-best" and
      "all-worst" boundary combinations. Then implement the function to pass.
- [x] Write failing Zod schema tests for `GameLog` create/update (valid + invalid: bad `result`/`bestOf`
      pairing, sideB with zero/conflicting opponent identifiers, missing sideA pilot/deck), then add the
      schemas.
- [x] Add the Prisma `GameLog` model + migration; run `pnpm --filter api prisma migrate dev`.
- [x] Write a failing integration test proving a **client-supplied `confidenceWeight` is ignored** and the
      server-derived value is stored, then implement the create path.
- [x] Write failing integration tests for CRUD, filtering (`?formatId=&eventId=&deckId=&heroId=&pilotUserId=`),
      and re-derivation on factor edit, then implement.
- [x] Write failing **cross-team FK** tests (a `GameLog` referencing a team-B deck or event is rejected),
      then enforce the same-`teamId` check in the service.
- [x] Write failing **tenant-isolation** tests (team A cannot read/write team B's logs; forged `teamId`;
      cross-tenant read → `404`) and **AuthZ** tests (unauthenticated → `401`; editing another member's log
      without admin → `403`), then confirm.
- [x] Write failing component tests for the logging form (defaults applied, result/best-of consistency,
      opponent-identifier selection), then build the mobile form.
- [x] Wire the frontend to the API with team-scoped TanStack Query keys; show the derived-weight hint after
      save.
- [x] Update [README.md](README.md) status table and cross-links.

## Tests & verification

**Confidence-weight math (signature — call out explicitly)**
- Table-driven: e.g. all factors at their best → weight near `1.0`; all at their worst → near the documented
  floor; a mixed case (e.g. serious + tuned but skill mismatch + unfamiliar pilot) → the exact documented
  value. Every row asserts `0 ≤ confidenceWeight ≤ 1`. Lock the finalized ADR-0005 numbers into the table.

**Aggregation feed**
- A crafted set of logs produces the exact inputs the matchup layer will consume: correct **raw N** (count)
  and **Σ weights** per `(deck/hero, format, event)` grouping — verified here so [phase-07-matchups-and-coverage.md](phase-07-matchups-and-coverage.md) builds on trusted data.

**Integration (Vitest + test Postgres)**
- CRUD happy paths; `result`/`bestOf` inconsistency → `422`; sideB opponent rules enforced.
- Client-supplied weight ignored; factor edit re-derives and shifts the stored weight.
- **Tenant isolation (mandatory):** cross-team read → `404`; forged `X-Team-Id` → `403`; cross-team
  `deckId`/`eventId` → rejected.

**Component**
- Form applies factor defaults with zero taps; result buttons/stepper enforce best-of consistency; opponent
  picker lets you choose teammate vs external (deck/hero/archetype).

**End-to-end proof (commands)**
1. `pnpm --filter api prisma migrate dev` — migration applies.
2. `pnpm test` — unit (incl. the confidence-weight table) + integration + component green.
3. `pnpm test:e2e` — Playwright: sign in on a phone viewport → log a game against an opponent hero with
   default factors in under a handful of taps → see the derived-weight hint → the game appears in the list.
4. `pnpm lint && pnpm typecheck` — clean.

## Out of scope

- **Matchup aggregation, matrix, coverage, trust indicators** — [phase-07-matchups-and-coverage.md](phase-07-matchups-and-coverage.md).
- Deduplicating a game logged by both teammates (documented, not enforced in v1).
- Importing results from external match-trackers; any stored deck card-list (decks are links).

## See also

- Feature: [../features/game-logging.md](../features/game-logging.md) ·
  [../features/confidence-and-matchups.md](../features/confidence-and-matchups.md) ·
  [../features/events-and-gauntlets.md](../features/events-and-gauntlets.md) ·
  [../features/decks.md](../features/decks.md) · [../features/card-database.md](../features/card-database.md)
- Decisions: [../decisions/0005-confidence-weight-model.md](../decisions/0005-confidence-weight-model.md) ·
  [../decisions/0002-decks-as-links.md](../decisions/0002-decks-as-links.md) ·
  [../decisions/0008-multi-tenant-teams.md](../decisions/0008-multi-tenant-teams.md)
- Architecture: [../architecture/data-model.md](../architecture/data-model.md) ·
  [../architecture/multi-tenancy.md](../architecture/multi-tenancy.md) ·
  [../architecture/api-conventions.md](../architecture/api-conventions.md) ·
  [../architecture/frontend.md](../architecture/frontend.md) ·
  [../architecture/testing-strategy.md](../architecture/testing-strategy.md)
- Domain: [../domain/playtesting-methodology.md](../domain/playtesting-methodology.md) ·
  [../domain/flesh-and-blood.md](../domain/flesh-and-blood.md)
- Phases: [phase-03-decks.md](phase-03-decks.md) ·
  [phase-05-events-and-gauntlets.md](phase-05-events-and-gauntlets.md) ·
  [phase-07-matchups-and-coverage.md](phase-07-matchups-and-coverage.md)
- Skills: [../../.claude/skills/implementing-a-phase/SKILL.md](../../.claude/skills/implementing-a-phase/SKILL.md) ·
  [../../.claude/skills/adding-a-feature-module/SKILL.md](../../.claude/skills/adding-a-feature-module/SKILL.md)
</content>
