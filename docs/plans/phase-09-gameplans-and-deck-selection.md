# Phase 09 — Game-Plans & Deck Selection

## Goal

Close the event-centric loop: turn testing into decisions. Deliver written **matchup game-plans** (FaB's
equivalent of sideboard guides), a per-member **deck selection** per event that a team-admin can **lock**,
and a post-event **retrospective** that feeds learnings back into the team library. Every event ends in a
confident deck choice and a durable review ([ADR-0004](../decisions/0004-event-centric.md)).

## Depends on

- [phase-05-events-and-gauntlets.md](phase-05-events-and-gauntlets.md) — deck selections and retrospectives
  are keyed to an event; game-plans may target a `GauntletEntry`.
- [phase-07-matchups-and-coverage.md](phase-07-matchups-and-coverage.md) — game-plans and deck selection are
  reached from the matchup matrix and informed by matchup reads.

(Matches the roadmap dependency graph: `p05 --> p09`, `p07 --> p09`.)

## Implements

- Feature spec: [../features/gameplans-and-deck-selection.md](../features/gameplans-and-deck-selection.md)
- Decision: [../decisions/0004-event-centric.md](../decisions/0004-event-centric.md) ·
  [../decisions/0002-decks-as-links.md](../decisions/0002-decks-as-links.md) (game-plans reference cards,
  never a stored list)
- Architecture: [../architecture/data-model.md](../architecture/data-model.md#game-plans) ·
  [../architecture/multi-tenancy.md](../architecture/multi-tenancy.md) ·
  [../architecture/api-conventions.md](../architecture/api-conventions.md) ·
  [../architecture/frontend.md](../architecture/frontend.md)
- Domain: [../domain/playtesting-methodology.md](../domain/playtesting-methodology.md) (§4, §6) ·
  [../domain/flesh-and-blood.md](../domain/flesh-and-blood.md) (no MTG sideboards; plans capture equipment/
  weapon/card choices and lines)

## Scope

- **`MatchupGamePlan`** `{ id, teamId, ourDeckId (→ Deck), opponentRef (gauntletEntryId | heroId |
  archetypeLabel), formatId, body (markdown), keyCards[] (→ Card), updatedBy }` — one canonical plan per
  `(ourDeckId, opponentRef, formatId)`; editing updates in place and stamps `updatedBy`; duplicate create →
  `409`. `keyCards` validated against the team's `gameId`. A collaboration subject
  (`subjectType: 'matchup_game_plan'`).
- **`DeckSelection`** `{ id, eventId (→ Event), userId, deckId (→ Deck), locked, lockedAt?, reasoning }` —
  one per `(event, user)`; member edits their own while unlocked; **only a team-admin can lock/unlock**.
  Locked → member edits of `deckId`/`reasoning` rejected `422`.
- **`Retrospective`** `{ id, eventId (→ Event), teamId, authorId, body, resultsSummary, learnings }` —
  typically one per event; `body` required, `resultsSummary`/`learnings` optional; any member authors,
  team-admins edit/archive.
- Team-scoped CRUD; cross-team FK rejection (`ourDeckId`, `deckId`, `keyCards`, `eventId`,
  `gauntletEntryId` all share `teamId`/game).
- Frontend: a **game-plan editor** (markdown + card autocomplete/hover), a per-event **deck selection**
  card + roster with lock state, and a **retrospective editor**.

## Deliverables

- Prisma models `MatchupGamePlan`, `DeckSelection`, `Retrospective` + a migration; composite
  `(teamId, ...)` indexes; `MatchupGamePlan` unique on `(teamId, ourDeckId, opponentRef, formatId)`;
  `DeckSelection` unique on `(eventId, userId)`.
- Zod schemas in `packages/shared` for each entity (opponentRef union, markdown body, keyCards references,
  lock fields), DTOs via `z.infer`.
- A **deck-selection lock** authorization helper (team-admin only) and a locked-edit guard (single place).
- NestJS `GamePlansModule` (game-plans + deck-selection + retrospective, or split as appropriate),
  all queries filtered by verified `teamId`, endpoints per the feature spec's API surface.
- Frontend `gameplans` (and event deck-selection / retrospective) feature folders with card autocomplete +
  hover/press preview and team-scoped TanStack Query keys.
- Full test suite (see below).

## Task checklist (test-first, ordered)

- [ ] Write failing Zod schema tests for the three entities (valid + invalid; required `body`; opponentRef
      exactly one form), then add the schemas.
- [ ] Add the Prisma models + migration; run `pnpm --filter api prisma migrate dev`.
- [ ] Write failing integration tests for `MatchupGamePlan` CRUD, the single-canonical-plan rule (duplicate
      create → `409`, edit updates in place, `updatedBy` stamped), and card references resolving within the
      team's game, then implement.
- [ ] Write failing integration tests for `DeckSelection` upsert of the caller's own selection
      (`PUT .../deck-selections/me`), then implement.
- [ ] Write failing **lock-permission** tests: lock/unlock by a non-admin → `403`; a member editing a
      locked selection → `422`; team-admin lock → unlock → member edit succeeds. Then implement the lock
      helper + guard.
- [ ] Write failing integration tests for `Retrospective` CRUD (member authors; admin edits/archives),
      then implement.
- [ ] Write failing **cross-team FK** tests (game-plan/selection referencing a team-B deck, card, event, or
      gauntlet-entry rejected) and **tenant-isolation** tests (cross-tenant read → `404`; forged `teamId`
      → `403`), then confirm.
- [ ] Wire collaboration-core comments onto game-plans (`subjectType: 'matchup_game_plan'`).
- [ ] Write failing component tests for the game-plan editor (card autocomplete/hover, markdown), the
      deck-selection card + lock badge, and the retrospective editor, then build the UI.
- [ ] Update [README.md](README.md) status table and cross-links.

## Tests & verification

**Unit / behavior**
- Single canonical game-plan per `(ourDeckId, opponentRef, formatId)`: a second create → `409`; an edit
  mutates the existing row and stamps `updatedBy`.
- Lock state machine: `unlocked → locked → unlocked`; a member cannot lock or unlock.

**Integration (Vitest + test Postgres)**
- Game-plan / deck-selection / retrospective CRUD happy paths with correct status codes and envelopes.
- **Lock permissions (mandatory for this phase):** non-admin lock/unlock → `403`; edit of a locked
  selection by its owner → `422`; admin unlock re-enables member edits.
- Deck-selection format-mismatch warning surfaces (warning, not a hard block).
- **Tenant isolation (mandatory):** team A cannot read/write team B's game-plans, deck selections, or
  retrospectives (cross-tenant → `404`); forged `X-Team-Id` → `403`; cross-team deck/card/event/gauntlet
  references rejected.

**Component**
- Game-plan editor resolves card references with autocomplete and shows hover/press previews; deck-selection
  card shows a lock badge when locked and disables editing; retrospective editor exposes
  `resultsSummary`/`learnings` sections.

**End-to-end proof (commands)**
1. `pnpm --filter api prisma migrate dev` — migration applies.
2. `pnpm test` — unit + integration + component green.
3. `pnpm test:e2e` — Playwright: write a game-plan for our deck vs a gauntlet archetype (with key cards) →
   each member records a deck selection → a team-admin locks the roster → after the event, write the
   retrospective.
4. `pnpm lint && pnpm typecheck` — clean.

## Out of scope

- Auto-generating game-plans or roster recommendations; "what to test next" — phase-11 dashboard.
- The event/gauntlet/attendance model itself — [phase-05-events-and-gauntlets.md](phase-05-events-and-gauntlets.md).
- Matchup aggregation math — [phase-07-matchups-and-coverage.md](phase-07-matchups-and-coverage.md).
- Any stored deck card-list or in-app deck building ([ADR-0002](../decisions/0002-decks-as-links.md));
  legality validation of the chosen deck; email notifications (in-app only).

## See also

- Feature: [../features/gameplans-and-deck-selection.md](../features/gameplans-and-deck-selection.md) ·
  [../features/events-and-gauntlets.md](../features/events-and-gauntlets.md) ·
  [../features/decks.md](../features/decks.md) ·
  [../features/confidence-and-matchups.md](../features/confidence-and-matchups.md) ·
  [../features/collaboration-core.md](../features/collaboration-core.md) ·
  [../features/card-database.md](../features/card-database.md)
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
- Phases: [phase-05-events-and-gauntlets.md](phase-05-events-and-gauntlets.md) ·
  [phase-07-matchups-and-coverage.md](phase-07-matchups-and-coverage.md) ·
  [phase-08-testing-queue.md](phase-08-testing-queue.md)
- Skills: [../../.claude/skills/implementing-a-phase/SKILL.md](../../.claude/skills/implementing-a-phase/SKILL.md) ·
  [../../.claude/skills/adding-a-feature-module/SKILL.md](../../.claude/skills/adding-a-feature-module/SKILL.md)
</content>
