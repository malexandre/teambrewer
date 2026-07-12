# Feature: Game Logging

## Summary

Game logging captures a single recorded game or match between two sides, along with the **structured
confidence factors** that make the result trustworthy or not. It is the data source for every matchup
aggregate. Because the most common real-world flow is **logging on a phone right after playing**, the
logging form is optimized to be fast: pickers, autocomplete, and sensible defaults, with minimal typing.

Each log records who played which deck, who or what the opponent was (a teammate, or an external opponent
identified by name, deck, hero, or archetype), the result, and the confidence factors that derive a
`confidenceWeight`. How that weight is used lives in
[`confidence-and-matchups.md`](confidence-and-matchups.md); the factor→weight model is defined by
[ADR-0005](../decisions/0005-confidence-weight-model.md).

Logging is a short **wizard** (a fast 3-step path plus an optional 4th step) rather than a single long
form, and a log can optionally capture which **cards over- or under-performed**, each tagged as ours or
theirs — see [UI / UX](#ui--ux) and [Data](#data) below.

## Goals & value

- Make logging so fast that people actually do it — the value of matchup data depends on volume.
- Capture **why** a result is trustworthy (structured factors), not just the score
  ([playtesting-methodology §1](../domain/playtesting-methodology.md)).
- Support logging against **teammates and the field** (external opponents by hero/archetype), consistent
  with decks-being-links ([ADR-0002](../decisions/0002-decks-as-links.md)).
- Optionally tie a game to an **event** so results can be filtered by the tournament they were prep for.

## User stories

- As a **member**, right after a testing game I open a quick form, pick my deck, pick the opponent hero,
  tap the result, adjust confidence factors (pre-filled with defaults), and save — in under a minute.
- As a **member**, I log a game against a teammate, selecting both pilots and both decks so it counts for
  both sides.
- As a **member**, I log a game from a tournament by attaching the `eventId`, so it feeds that event's
  matchup view.
- As a **member**, I add a short `learnings` note and a `lossReason` tag so the team learns from the game,
  not just the win/loss.
- As a **member**, I edit or delete a game I logged if I made a mistake.

## Data

Uses **GameLog** from [data-model.md](../architecture/data-model.md#game-logging--matchups). Team-scoped
(`teamId`).

**GameLog** `{ id, teamId, loggedById, formatId, eventId?, playedAt,`
`sideA: { pilotUserId, deckId },`
`sideB: { pilotUserId? | externalOpponentName?, deckId? | heroId? | archetypeLabel? },`
`firstPlayerSide, bestOf, result, winType?, lossReason?, learnings,`
`confidenceFactors: { skillParity, seriousness, deckMaturity, pilotFamiliarity },`
`confidenceWeight (0–1, derived) }`

- **sideA** is always "our" side: a team member pilot (`pilotUserId`) on one of the team's decks (`deckId`).
- **sideB** is the opponent: **either** a teammate (`pilotUserId`) on a team deck, **or** an external
  opponent (`externalOpponentName?`) identified by `deckId` (a reference deck), `heroId`, or free-text
  `archetypeLabel`. At least one opponent identifier must be present.
- **firstPlayerSide** — which side took the first turn (going first vs second matters for FaB matchups).
- **bestOf** — `1` (single game) or `3`/`5` (match); `result` records games won A / B, or single-game
  win/loss/draw.
- **confidenceFactors** — four small enums (`skillParity`, `seriousness`, `deckMaturity`,
  `pilotFamiliarity`), each mapping to a 0–1 sub-score.
- **confidenceWeight** — derived server-side from the factors per
  [ADR-0005](../decisions/0005-confidence-weight-model.md); never client-supplied.
- **winType? / lossReason?** — optional tags (e.g. won on time, decked out, misplay); free-text
  `learnings`. These are captured but **do not affect the weight**.

**GameLogCard** `{ id, gameLogId, cardId, role: 'impressive' | 'underperforming', side: 'ours' | 'theirs' }`
(see [data-model.md](../architecture/data-model.md#game-logging--matchups)) — an optional set of card
references captured per log: which cards over- or under-performed, each tagged by side. Scoped transitively
through its parent `GameLog` (no `teamId` of its own), the same pattern as `Attendance` on `Event`. This is
a per-game observation, not durable matchup knowledge — "cards to watch for vs archetype X" is out of scope
here and belongs to phase-09's `MatchupGamePlan.keyCards[]`.

## Behavior & rules

- **confidenceWeight is always derived server-side** from `confidenceFactors` using the single, well-tested
  formula in [ADR-0005](../decisions/0005-confidence-weight-model.md). A client-sent weight is ignored.
- **Factor defaults:** the form pre-fills each factor with a sensible default (e.g. serious, tuned, evenly
  matched, familiar) so a fast save still yields a meaningful weight; the logger adjusts only what differs.
- **Result consistency:** `result` must be consistent with `bestOf` (e.g. a best-of-3 cannot record 3
  games won by one side and 3 by the other); draws allowed only where the format permits.
- **Opponent identity:** exactly one of {teammate pilot, external opponent} for sideB; the opponent deck
  identity is one of {reference `deckId`, `heroId`, `archetypeLabel`} (a teammate normally has a `deckId`).
- **Format & event coherence:** if `eventId` is set, the game's `formatId` should match the event's format;
  mismatch warns but is allowed (people test off-format).
- **Ownership / permissions:** the logger owns the row; the logger and team-admins may edit or archive it.
  Editing confidence factors re-derives the weight and thus affects aggregates. See
  [multi-tenancy §Roles](../architecture/multi-tenancy.md#roles--capabilities).
- **Soft-delete:** archived via `archivedAt`; excluded from aggregates but retained for history.
- **Captured cards:** `cardId` is validated against the team's game (cross-game card → `422`). On update,
  the impressive/underperforming arrays each **replace** the existing set for that role — the wizard always
  sends "the current set", not a delta.
- **Best-of default is game-driven:** the wizard pre-selects `bestOf` from `GET /api/game-config` (Flesh and
  Blood: `1`); `bestOf` itself stays a required, client-supplied field on create — the game config only
  seeds the initial selection, never a silent server-side default.

## API surface

Indicative REST per [api-conventions.md](../architecture/api-conventions.md); `teamId` from verified
context.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/game-logs` | List games (filter `?formatId=&eventId=&deckId=&heroId=&pilotUserId=`, cursor paginated) |
| `POST` | `/api/game-logs` | Log a game (weight derived server-side) |
| `GET` | `/api/game-logs/:gameLogId` | Game detail |
| `PATCH` | `/api/game-logs/:gameLogId` | Edit (re-derives `confidenceWeight` if factors change) |
| `DELETE` | `/api/game-logs/:gameLogId` | Archive (soft-delete) |

`POST`/`PATCH` accept optional `impressiveCards[]` / `underperformingCards[]` (each `{ cardId, side }`);
`GET .../:gameLogId` nests them back as `{ card: <card summary>, side }` per role. The team-scoped
`GET /api/game-config` (used by the wizard, not by game-logs itself) is documented in
[game-abstraction.md](../architecture/game-abstraction.md).

Request/response bodies validate against Zod schemas in `packages/shared`; `confidenceWeight` appears only
in responses.

## UI / UX

- **A short wizard, not one long form** — the signature UX requirement, used on every viewport (mobile-first;
  desktop renders the same steps centered and roomier). A `GameLogWizard` owns all form state; each step is
  a small, independently-testable child. A header shows a **"Step N of 3"** indicator with **Back**/**Next**;
  **Next** validates the current step before advancing. Only the three core steps count toward the
  indicator — step 4 is an optional appendix, so a fast log always reads "of 3". Edit mode reuses the same
  wizard, seeded from the existing log; step 4 opens by default on edit if the log already has notes/cards.
  - **Step 1 · Matchup** — format; my deck; opponent (kind switcher → hero / teammate / archetype /
    reference deck, revealing the matching control). Validates format + deck + opponent identified.
  - **Step 2 · Result** — best-of (pre-selected from the team's game via `GET /api/game-config`); who went
    first; Win/Loss/Draw for a single game, or games-won steppers for a match. Validates result-vs-best-of
    consistency.
  - **Step 3 · Confidence** — the four segmented confidence factors, **pre-filled with defaults**, plus the
    live "counts as ~0.XX" hint and the primary **Log game** button — the fast finish; a fast log is three
    steps and zero required taps on the factors.
  - **Step 4 · Notes & cards (optional)** — reached via "Add notes & cards" from step 3, or skipped entirely.
    Holds impressive cards, underperforming cards (each added via `CardPicker` and tagged ours/theirs),
    `learnings`, `winType`/`lossReason`, `eventId`, opponent pilot/name. Has its own **Save**.
- Minimal free typing overall; card/hero references support a **hover/press image preview** of the card.
- Show the **derived confidence weight** back to the logger after save (a small "this game counts as ~0.7"
  hint), reinforcing the model without asking them to compute it; the detail hub also renders any captured
  impressive/underperforming cards, tagged ours/theirs.

## Tenancy & permissions

Every `GameLog` carries `teamId` and is filtered server-side by the verified active team. Any referenced
`deckId` (either side) and `eventId` must belong to the same team — cross-team foreign keys are rejected in
the service layer. See [multi-tenancy.md](../architecture/multi-tenancy.md). Cross-tenant reads return
`404`.

## Edge cases

- **External opponent with only an archetype label:** allowed — the game still aggregates by archetype even
  without a hero or reference deck.
- **Same game logged by both teammates:** two-player games should be logged once; the UI warns if a very
  similar recent game exists. Aggregation dedup is out of scope for v1 (documented, not enforced).
- **Deck archived after games logged:** logs persist and still aggregate; the deck renders as archived.
- **Factors left at defaults:** valid — yields the default weight; this is the fast-path expectation.
- **Match with intentional draw / unfinished:** `result` supports draws where legal and an
  incomplete/unresolved marker where the format allows.
- **Editing factors months later:** re-derives the weight and shifts historical aggregates — expected and
  covered by tests.

## Testing notes

Follow [testing-strategy.md](../architecture/testing-strategy.md).

- **Confidence weight derivation:** table-driven unit tests mapping factor combinations →
  `confidenceWeight` exactly per [ADR-0005](../decisions/0005-confidence-weight-model.md); assert the
  result is always within `[0,1]` and that a client-supplied weight is ignored.
- **Validation:** `result` inconsistent with `bestOf` rejected; sideB with zero or conflicting opponent
  identifiers rejected; missing sideA pilot/deck rejected.
- **Tenant isolation:** a user in team A cannot read/write team B's game logs; a log cannot reference a
  deck or event from another team; a cross-tenant log's captured cards are never reachable (the
  `GameLogCard` parent-scoping pattern is explicitly proven, not assumed).
- **AuthZ:** unauthenticated → `401`; editing another member's log without admin role → `403`.
- **Aggregation feed:** a crafted set of logs produces the expected inputs consumed by
  [`confidence-and-matchups.md`](confidence-and-matchups.md) (raw N and Σ weights).
- **Card capture:** a cross-game `cardId` is rejected (`422`); update replaces the captured set per role;
  each wizard step renders, validates, and navigates correctly (mocked `GET /api/game-config` for the
  best-of default); the phone-viewport e2e walks the 3-step fast path, then a second run opens step 4,
  adds an impressive card, and sees it on the detail hub.

## Out of scope

- **Matchup aggregation, matrix, coverage, trust indicators** — see
  [`confidence-and-matchups.md`](confidence-and-matchups.md).
- The exact factor→weight combination formula — owned by
  [ADR-0005](../decisions/0005-confidence-weight-model.md) (finalized in phase-06).
- Importing results from external match-trackers; deck card-list capture (decks are links).
- **"Cards to look out for vs archetype X"** — durable matchup knowledge, owned by phase-09's
  `MatchupGamePlan.keyCards[]`, not a per-game observation. "Try card X" tech ideas remain phase-08's
  `CardTestSuggestion`.

## See also

- [ADR-0005 confidence-weight-model](../decisions/0005-confidence-weight-model.md) ·
  [ADR-0002 decks-as-links](../decisions/0002-decks-as-links.md)
- [playtesting-methodology.md](../domain/playtesting-methodology.md) (§1) ·
  [flesh-and-blood.md](../domain/flesh-and-blood.md)
- [data-model.md](../architecture/data-model.md) · [multi-tenancy.md](../architecture/multi-tenancy.md) ·
  [api-conventions.md](../architecture/api-conventions.md) · [frontend.md](../architecture/frontend.md)
- [`confidence-and-matchups.md`](confidence-and-matchups.md) ·
  [`events-and-gauntlets.md`](events-and-gauntlets.md) · [`decks.md`](decks.md) ·
  [`card-database.md`](card-database.md)
- Implementing phase: [`phase-06-game-logging.md`](../plans/phase-06-game-logging.md)
- Wizard + card-capture design:
  [`2026-07-12-game-logging-wizard-and-card-capture-design.md`](../superpowers/specs/2026-07-12-game-logging-wizard-and-card-capture-design.md)
- [game-abstraction.md](../architecture/game-abstraction.md) (`defaultBestOf`, `GET /api/game-config`)
</content>
