# Phase 12 — Riftbound Adapter

## Goal

Prove the core is genuinely game-agnostic by adding **Riftbound** as a second game **entirely through a new
`GameAdapter` + reference data** — no changes to core or feature modules. A team can then be created bound
to Riftbound and use **every existing feature** (decks, events, gauntlets, game logging, matchups, testing
queue, game-plans, collaboration, knowledge, dashboard) unchanged. This is the acceptance test for
[ADR-0006 game-agnostic-core](../decisions/0006-game-agnostic-core.md).

> **Critical acceptance criterion:** implementing Riftbound must require **only** a new adapter and its
> reference data. **If any core or feature-module code must change to make Riftbound work, the abstraction
> leaked** — stop, document the leak, fix the boundary (push the game-specific concern behind the adapter),
> and record it in this plan and, if it changes a decision, in the relevant ADR.

## Depends on

- [phase-02 — Card Database](phase-02-card-database.md) — establishes the `GameAdapter` interface, the
  normalized `Card` model, the card-sync job, and the FaB reference adapter that this phase mirrors. This
  is the only hard dependency per the [roadmap graph](README.md).

Note: this phase can be built independently of phases 03–11; its **smoke test**, however, exercises those
features for a Riftbound team, so they should exist to run the full smoke suite (they do by the time this
phase is picked up in sequence).

## Implements

- ADR: [ADR-0006 game-agnostic-core](../decisions/0006-game-agnostic-core.md),
  [ADR-0007 external-data-approach](../decisions/0007-external-data-approach.md) (sanctioned source, sync
  don't scrape), [ADR-0008 multi-tenant-teams](../decisions/0008-multi-tenant-teams.md) (a team is bound to
  one game)
- Architecture: [game-abstraction](../architecture/game-abstraction.md)
- Domain: [riftbound](../domain/riftbound.md), [card-data-sources](../domain/card-data-sources.md)

## Scope

Implement `apps/api/src/games/riftbound/` satisfying the same `GameAdapter` contract as the FaB adapter:

- **`key: 'riftbound'`**, `displayName`, and **`identityLabel: 'Legend'`** (FaB's is "Hero").
- **Formats**: `listFormats()` returns the Riftbound format definitions (confirm the current list at build
  time) stored as `Format` rows for the Riftbound `Game`.
- **Identity / faction axes**: Legend as the deck identity; **Domain** (color/faction axis) and **Region**
  (LoL region) as display/constraint metadata — mapped onto the same adapter surfaces FaB uses for
  hero/class/talent, **without** introducing Riftbound-only fields into core.
- **Card schema mapping**: `mapCard(raw)` maps Riftcodex fields (name, cost/energy, might/power, type,
  tags, keywords, rarity, set, domain, region, …) into the normalized `Card` model; `cardIdentity(card)`
  defines the Riftbound card identity (confirm whether name alone suffices, unlike FaB's name + pitch).
- **Card data sync**: `fetchCardSource()` pulls from the **[Riftcodex](https://riftcodex.com/) open REST
  API** (`https://api.riftcodex.com/api/`, `cards` endpoint with `limit`/`page`/`set_id`). Reuse the
  existing global, idempotent card-sync job from phase-02 — only the adapter (source + mapping) is new.
- **Deck-link recognition** (optional, ToS-safe): `recognizeDeckUrl?` for known Riftbound builder URLs;
  **no scraping of deck contents** (decks stay link-only per ADR-0002/0007).
- **Reference-data seeding**: create the Riftbound `Game` row, its `Format` rows, Legend/identity reference
  rows, and run the card sync into the global `Card` table (scoped by `gameId`).
- Expose Riftbound labels/formats to the frontend via the same config/endpoint the FaB adapter uses so the
  UI shows "Legend", Riftbound formats, and Riftbound card fields with **no UI code branching on game**.

**Build-time verification (do this first, per [ADR-0007](../decisions/0007-external-data-approach.md) and
[data-sources rule](../../.claude/rules/data-sources.md)):** confirm Riftcodex's **current endpoints,
field names, pagination, rate limits, and terms/license** from its live `/docs` — the
[riftbound domain doc](../domain/riftbound.md) is explicitly provisional. Attribute the source in-app.
Respect rate limits; cache/sync, never live-hammer.

## Deliverables

- `apps/api/src/games/riftbound/` adapter implementing the full `GameAdapter` contract, registered in the
  adapter registry keyed by game (the registry itself is core and must **not** need edits beyond adding the
  new adapter to its map — if it does, that is a boundary leak to document).
- Riftbound **reference-data seed** (Game, Formats, Legends/identities) + card-sync wiring reusing the
  phase-02 job.
- A committed **fixture** subset of Riftcodex card responses for deterministic tests (no network in tests).
- A short **boundary report** section appended to this plan on completion: either "no core changes were
  required" (expected) or an itemized list of every core change that was needed and why (a leak to fix).
- Updated frontend config so Riftbound teams render correct labels/formats/card fields with no game
  branching.

## Task checklist (test-first, ordered)

- [ ] Read [game-abstraction](../architecture/game-abstraction.md), [riftbound](../domain/riftbound.md),
      [card-data-sources](../domain/card-data-sources.md), the FaB adapter (reference implementation), and
      the [`working-with-card-data`](../../.claude/skills/working-with-card-data/SKILL.md) and
      [`implementing-a-phase`](../../.claude/skills/implementing-a-phase/SKILL.md) skills.
- [ ] **Confirm Riftcodex** endpoints/fields/pagination/rate-limits/terms from the live API `/docs`;
      capture a fixture card payload; record the confirmed schema in the plan/spec.
- [ ] Write failing unit tests for `mapCard` against the fixture (field-by-field mapping, Domain/Region,
      missing-field handling) and `cardIdentity`; then implement the mapping.
- [ ] Write failing unit tests for `listFormats()` returning the confirmed Riftbound formats; implement.
- [ ] Write a failing integration test for card-sync **idempotency** using the fixture (run twice → same
      rows, upsert by `(gameId, externalId)`, correct `sourceVersion`); implement the adapter's
      `fetchCardSource` behind the existing sync job to pass it.
- [ ] Seed the Riftbound Game/Formats/Legends reference data; register the adapter in the registry.
- [ ] Write the **cross-game smoke test**: create a team bound to Riftbound, then exercise decks, events,
      gauntlets, game logging, matchups, testing queue, game-plans, and knowledge — all succeed unchanged.
- [ ] **Run a diff audit** of the change set: confirm only `apps/api/src/games/riftbound/`, the adapter
      registry entry, reference-data/seed, fixtures, tests, and frontend config changed — **no core/feature
      module logic**. Record the result as the boundary report. If core changed, fix the boundary and
      re-run.
- [ ] Run the full verification below; update the [roadmap Status table](README.md).

## Tests & verification

**Adapter mapping (unit).** `mapCard` over the committed Riftcodex fixture produces the expected normalized
`Card` fields (including Domain/Region → the generic faction/affinity surfaces); `cardIdentity` matches the
confirmed Riftbound identity rule. Edge cases: missing optional fields, multi-value tags/keywords.

**Sync idempotency (integration).** Running the card sync twice with the fixture yields identical rows
(upsert by stable id, no duplicates), records `sourceVersion`, and is global (no `teamId`).

**Cross-game smoke (integration/e2e).** With a **Riftbound-bound team**: create a deck (Legend + Riftbound
format + external link), an event + gauntlet entry (with `expectedMetaShare`), log a game between two decks,
read the resulting matchup aggregate, create a test assignment and suggestion, and add a primer — each
works with **zero game-specific branching in the exercised code paths**. Assert the UI/labels show "Legend"
and Riftbound formats, not FaB terms.

**Isolation still holds.** A Riftbound team and a FaB team on the same instance never see each other's data
(reuse the two-team isolation fixture); a Riftbound team reads only Riftbound `Card`/`Format`/identity
reference data (filtered by `gameId`), never FaB reference data, and vice versa.

**No-core-change audit (the acceptance criterion).** `git diff --stat` for the phase touches only adapter,
registry map, reference-data/seed, fixtures, tests, and frontend config — **no core or feature-module
logic files**. This audit result is the primary sign-off for the phase.

**End-to-end steps to prove it works:**
1. Confirm Riftcodex is reachable and the fixture matches its current schema.
2. `pnpm test` — adapter unit tests, sync idempotency, cross-game smoke, and isolation tests green.
3. `pnpm dev`; as instance-admin create a Riftbound team; run the Riftbound card sync; walk the full flow
   (deck → event/gauntlet → game log → matchup → assignment → primer) and confirm correct labels.
4. Confirm a FaB team still works identically and the two teams' data/reference sets never mix.
5. Review `git diff --stat`; record the boundary report; `pnpm lint && pnpm typecheck` clean.

## Out of scope

- Deep/accurate Riftbound rules modeling beyond what the adapter surfaces require — do not over-invest;
  confirm specifics at build time ([riftbound](../domain/riftbound.md)).
- Automated external meta feeds or decklist import for Riftbound (link-only, per
  [ADR-0007](../decisions/0007-external-data-approach.md) / [ADR-0002](../decisions/0002-decks-as-links.md)).
- Any refactor of FaB behavior beyond fixing a genuine boundary leak surfaced by this phase.
- Cross-game teams or a team switching games — a team is bound to one game
  ([ADR-0008](../decisions/0008-multi-tenant-teams.md)).

## See also

- Architecture: [game-abstraction](../architecture/game-abstraction.md) ·
  [data-model](../architecture/data-model.md) · [multi-tenancy](../architecture/multi-tenancy.md) ·
  [testing-strategy](../architecture/testing-strategy.md)
- Decisions: [ADR-0006 game-agnostic-core](../decisions/0006-game-agnostic-core.md) ·
  [ADR-0007 external-data-approach](../decisions/0007-external-data-approach.md) ·
  [ADR-0008 multi-tenant-teams](../decisions/0008-multi-tenant-teams.md) ·
  [ADR-0002 decks-as-links](../decisions/0002-decks-as-links.md)
- Domain: [riftbound](../domain/riftbound.md) · [card-data-sources](../domain/card-data-sources.md)
- Feature: [card-database](../features/card-database.md)
- Prior phase: [phase-02 — Card Database](phase-02-card-database.md)
- Rule: [data-sources](../../.claude/rules/data-sources.md)
- Skills: [`working-with-card-data`](../../.claude/skills/working-with-card-data/SKILL.md) ·
  [`implementing-a-phase`](../../.claude/skills/implementing-a-phase/SKILL.md)
