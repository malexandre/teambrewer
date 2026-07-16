# ADR-0010: Meta as the organizing hub

- **Status:** Accepted (2026-07-13). **Supersedes [ADR-0004](0004-event-centric.md)** (event-centric
  organization).
- **Context:** TeamBrewer v1 made the **Event** the central organizing concept (ADR-0004): gauntlets,
  expected-metagame weighting, matchup coverage, test assignments, deck selection, and the retrospective all
  hung off a target tournament. In practice the team's durable organizing unit is the **metagame**, not
  individual events — the field to beat persists across many events, and much of the event-centric surface
  (deck selection lock-in, per-event retrospectives, the standalone matchups/coverage tab, the dashboard,
  the knowledge base) proved unused or better served on the deck page or in Discord. This is the v2
  "meta-pivot" redesign; the app re-centers on a lightweight, team-scoped **Meta**.

## Decision

The **Meta** (a dated metagame window with a tiered opponent-deck list) is the central organizing concept.

- **Meta** is **team-scoped** (like every other domain row): `{ name, startDate, endDate, description }`.
  The **current meta** is the one whose `[startDate, endDate]` contains today (latest `startDate` wins on
  overlap), resolved server-side.
- The gauntlet moves onto the Meta as a **tiered opponent-deck list** (`MetaDeckEntry`): each entry is a
  matchup subject — a **required label** with an **optional hero qualifier** — and a **`tier`**
  (`meta_defining | contender | counter_meta | fringe`) instead of a raw `expectedMetaShare %`.
- **Matchup coverage is shown per-deck** (a "readiness vs the current meta" section on the deck page),
  reusing the confidence-weighted aggregation math ([ADR-0005](0005-confidence-weight-model.md)) — the
  standalone matchups/coverage tab is dropped.
- The two testing-queue models (`CardTestSuggestion` + `TestAssignment`) merge into one free-form **`Task`**
  (`proposed → assigned → finished | abandoned`; finishing demands a report). Linked cards live **inline**
  in the task description as `+[[cardId]]` tokens (no card FK table).
- Card linking is **inline `+card` mentions everywhere** (any prose body), mirroring the `@member` composer;
  structured card-picker chip lists (e.g. on game-plans) are removed. `@member` mentions are unchanged.
- **Events become lightweight, social, and isolated:** `{ name, date, location?, description }` + RSVP
  (`going | interested`). Status, importance, format, gauntlets, deck selection, the retrospective, and
  the meta link are removed from the event. A `GameLog` gains an optional `metaId` (auto-suggested from
  `playedAt`) — matchup attribution now hangs off the meta (via game logs), not off events.
- The authenticated **landing page is Decks**; the dashboard, knowledge base, activity tab, team roster tab,
  cards page, and matchups tab are removed.

## Consequences

- The primary loop simplifies to **decks ↔ current meta ↔ tasks**; the field to beat is defined once per
  meta window and reused across every event in it.
- Matchup readiness lives where decisions are made (the deck page), not in a separate analytics tab.
- Fewer models and tabs to maintain; the confidence-weight math ([ADR-0005](0005-confidence-weight-model.md))
  and the collaboration core (comments/mentions/activity, now including `task`) are **retained and reused**.
- The change is delivered as an ordered set of workstreams; the additive **foundation** (new Prisma models,
  shared contracts, registries, this ADR) lands first so old and new models coexist while later workstreams
  transform the feature modules.
- **Data is disposable** (pre-release, local-first): removed tables are dropped outright by later
  workstreams' migrations.

## Alternatives considered

- **Keep the event-centric model (ADR-0004)** — rejected: events are frequent and disposable; the metagame
  is the durable organizing unit, and the event-shaped surface was largely unused.
- **Format-centric** — rejected for the same reasons as in ADR-0004: formats are a dimension/filter, not the
  driver.

## See also

- [ADR-0004 event-centric](0004-event-centric.md) (superseded) ·
  [ADR-0005 confidence-weight model](0005-confidence-weight-model.md) (retained) ·
  [ADR-0002 decks as links](0002-decks-as-links.md)
- [metas.md](../features/metas.md) · [tasks.md](../features/tasks.md) ·
  [events-and-gauntlets.md](../features/events-and-gauntlets.md) ·
  [confidence-and-matchups.md](../features/confidence-and-matchups.md)
