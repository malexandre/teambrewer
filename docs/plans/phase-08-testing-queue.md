# Phase 08 — Testing Queue

## Goal

Turn testing from ad-hoc into deliberate. Deliver **per-deck card-test suggestions** (tech ideas with
reasoning and a status lifecycle), **voting** on those suggestions, and **test assignments** that hand out
specific matchups so the field's bogeymen actually get piloted
([playtesting-methodology §2 & §4](../domain/playtesting-methodology.md)). Discussion attaches via the
collaboration core built in phase-04.

## Depends on

- [phase-03-decks.md](phase-03-decks.md) — suggestions are per deck; assignments reference our decks.
- [phase-04-collaboration-core.md](phase-04-collaboration-core.md) — comments/@mentions/activity attach to
  suggestions and assignments.

(Matches the roadmap dependency graph: `p03 --> p08`, `p04 --> p08`.)

## Implements

- Feature spec: [../features/testing-queue.md](../features/testing-queue.md)
- Decision: [../decisions/0002-decks-as-links.md](../decisions/0002-decks-as-links.md) (tech cards, not
  stored lists) · [../decisions/0004-event-centric.md](../decisions/0004-event-centric.md) (assignments can
  reference an event)
- Architecture: [../architecture/data-model.md](../architecture/data-model.md#testing-queue) ·
  [../architecture/multi-tenancy.md](../architecture/multi-tenancy.md) ·
  [../architecture/api-conventions.md](../architecture/api-conventions.md) ·
  [../architecture/frontend.md](../architecture/frontend.md)
- Domain: [../domain/playtesting-methodology.md](../domain/playtesting-methodology.md) (§2, §4)

## Scope

- **`CardTestSuggestion`** `{ id, teamId, deckId, authorId, cardInId (→ Card), cardOutId? (→ Card),
  reasoning, status: proposed | testing | adopted | rejected, resolutionNote }` — one suggestion per tech
  idea for a specific deck. Guarded status lifecycle: `proposed → testing → adopted | rejected`, with a
  `resolutionNote` required when resolving to `adopted`/`rejected`.
- **`SuggestionVote`** `{ id, suggestionId, userId }` — one **upvote** per user per suggestion (idempotent
  upsert; the row's existence is the upvote — **upvote-only**, no `value` column; decided with the user).
- **`TestAssignment`** `{ id, teamId, eventId?, assigneeId, assignedById, deckId (ours),
  opponentRef (gauntletEntryId | heroId | archetypeLabel), opponentSnapshotLabel, targetGames?, status,
  notes }` — a matchup handed to a member to test, with an optional target game count and the status
  lifecycle `open → in_progress → done`, plus a `cancelled` terminal (the feature-spec vocabulary, decided
  with the user). `opponentSnapshotLabel` is a server-derived human label that survives deletion of the
  referenced gauntlet entry/hero.
- Team-scoped CRUD for all three; card references validated against the team's `gameId`; cross-team FK
  rejection (deck, event, gauntlet-entry, cards all share `teamId`/game).
- Discussion via collaboration-core: suggestions and assignments are comment subjects
  (`subjectType: 'card_test_suggestion'` / `'test_assignment'`).
- Frontend: a **suggestion board per deck** (grouped by status), **voting**, and **assignment management**
  (assign a matchup, track progress).

## Deliverables

- Prisma models `CardTestSuggestion`, `SuggestionVote`, `TestAssignment` + a migration; composite
  `(teamId, ...)` indexes; `SuggestionVote` unique on `(suggestionId, userId)`.
- Zod schemas in `packages/shared` for each entity (status enums, vote value, opponentRef union), DTOs via
  `z.infer`.
- Suggestion **status-transition** and assignment **status-transition** helpers (single place each, legal
  transition tables; illegal → `422`; resolution requires `resolutionNote`).
- NestJS `TestingQueueModule` (controller + service + Prisma access), all queries filtered by verified
  `teamId`; endpoints for suggestions, votes, and assignments per the feature spec.
- Frontend `testing-queue` feature folder: per-deck suggestion board, vote controls, assignment list/detail,
  and inline comment threads via collaboration-core.
- Full test suite (see below).

## Task checklist (test-first, ordered)

- [x] Write failing Zod schema tests for the three entities (valid + invalid, incl. resolution requiring a
      `resolutionNote`), then add the schemas.
- [x] Write failing unit tests for the suggestion status-transition helper (legal vs illegal;
      resolution-note requirement), then implement.
- [x] Write failing unit tests for the assignment status-transition helper, then implement.
- [x] Add the Prisma models + migration; run `pnpm --filter api prisma migrate dev`.
- [x] Write failing integration tests for `CardTestSuggestion` CRUD + status transitions scoped to a team,
      then implement.
- [x] Write failing integration tests for `SuggestionVote` idempotency (one row per user; changing a vote
      updates it), then implement.
- [x] Write failing integration tests for `TestAssignment` lifecycle (assign → in_progress → done;
      cancel), then implement.
- [x] Write failing **cross-team FK** tests (suggestion/assignment referencing a team-B deck, event,
      gauntlet-entry, or card is rejected) and **tenant-isolation** tests (cross-tenant read → `404`;
      forged `teamId` → `403`), then confirm.
- [x] Wire collaboration-core comment subjects onto suggestions and assignments.
- [x] Write failing component tests for the suggestion board (grouped by status), vote control, and
      assignment management, then build the UI with team-scoped TanStack Query keys.
- [x] Update [README.md](README.md) status table and cross-links.

## Tests & verification

**Unit**
- Suggestion transitions: `proposed → testing → adopted`, `proposed → testing → rejected`, and
  `proposed → rejected` legal per spec; illegal (e.g. `adopted → testing`) → `422`; resolving without a
  `resolutionNote` → rejected.
- Assignment transitions: legal lifecycle accepted; illegal rejected.

**Integration (Vitest + test Postgres)**
- Suggestion/vote/assignment CRUD happy paths with correct status codes and envelopes.
- **Voting (upvote-only):** repeated `PUT` by one user → a single row (idempotent); retract removes it;
  vote tallies reflect distinct upvoters.
- **Assignment lifecycle:** status advances correctly (`open → in_progress → done`); `targetGames`
  optional; `done`/`cancelled` are terminal.
- **Tenant isolation (mandatory):** team A cannot read/write team B's suggestions, votes, or assignments
  (cross-tenant → `404`); forged `X-Team-Id` → `403`; cross-team deck/event/gauntlet-entry/card references
  rejected.

**Component**
- Suggestion board groups suggestions by status; vote control reflects the current user's vote; assignment
  management shows assignee, our deck, opponent, and status.

**End-to-end proof (commands)**
1. `pnpm --filter api prisma migrate dev` — migration applies.
2. `pnpm test` — unit + integration + component green.
3. `pnpm test:e2e` — Playwright: propose a card swap on a deck → a teammate votes → move it to *testing* →
   assign the matchup to a member → resolve as *adopted* with a note; a comment thread is attached
   throughout.
4. `pnpm lint && pnpm typecheck` — clean.

## Out of scope

- **Matchup aggregation and the coverage tracker** that consumes assignments —
  [phase-07-matchups-and-coverage.md](phase-07-matchups-and-coverage.md).
- The collaboration primitives themselves (comments/mentions/activity/notifications) —
  [phase-04-collaboration-core.md](phase-04-collaboration-core.md).
- Written matchup game-plans — [phase-09-gameplans-and-deck-selection.md](phase-09-gameplans-and-deck-selection.md).
- Any stored deck card-list ([ADR-0002](../decisions/0002-decks-as-links.md)).

## See also

- Feature: [../features/testing-queue.md](../features/testing-queue.md) ·
  [../features/decks.md](../features/decks.md) ·
  [../features/collaboration-core.md](../features/collaboration-core.md) ·
  [../features/events-and-gauntlets.md](../features/events-and-gauntlets.md) ·
  [../features/confidence-and-matchups.md](../features/confidence-and-matchups.md)
- Decisions: [../decisions/0002-decks-as-links.md](../decisions/0002-decks-as-links.md) ·
  [../decisions/0004-event-centric.md](../decisions/0004-event-centric.md) ·
  [../decisions/0008-multi-tenant-teams.md](../decisions/0008-multi-tenant-teams.md)
- Architecture: [../architecture/data-model.md](../architecture/data-model.md) ·
  [../architecture/multi-tenancy.md](../architecture/multi-tenancy.md) ·
  [../architecture/api-conventions.md](../architecture/api-conventions.md) ·
  [../architecture/frontend.md](../architecture/frontend.md) ·
  [../architecture/testing-strategy.md](../architecture/testing-strategy.md)
- Domain: [../domain/playtesting-methodology.md](../domain/playtesting-methodology.md) ·
  [../domain/flesh-and-blood.md](../domain/flesh-and-blood.md)
- Phases: [phase-03-decks.md](phase-03-decks.md) ·
  [phase-04-collaboration-core.md](phase-04-collaboration-core.md) ·
  [phase-07-matchups-and-coverage.md](phase-07-matchups-and-coverage.md)
- Skills: [../../.claude/skills/implementing-a-phase/SKILL.md](../../.claude/skills/implementing-a-phase/SKILL.md) ·
  [../../.claude/skills/adding-a-feature-module/SKILL.md](../../.claude/skills/adding-a-feature-module/SKILL.md)
