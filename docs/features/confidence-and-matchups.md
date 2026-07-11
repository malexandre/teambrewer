# Feature: Confidence & Matchups

## Summary

This is TeamBrewer's **signature feature**. Not all game results are equally trustworthy, so matchup win
rates are **confidence-weighted** and the **raw sample size is always shown** next to a **trust indicator**.
Every logged game carries structured **confidence factors** that combine into a `confidenceWeight ∈ [0,1]`
([ADR-0005](../decisions/0005-confidence-weight-model.md)); matchups aggregate those weighted results into
a **matchup matrix** (by deck and by hero, scoped by team / format / event). A **coverage tracker** flags
matchups that fall below a confidence/sample threshold and links to who is assigned to test them.

The rule of record: a high win rate over a tiny or low-confidence sample must read as *untrusted*. See
[playtesting-methodology §1–3](../domain/playtesting-methodology.md).

## Goals & value

- Turn a pile of game logs into **trustworthy, self-explaining matchup reads** — the number and *why it is
  or isn't reliable* ([playtesting-methodology §1](../domain/playtesting-methodology.md)).
- Never let a small sample masquerade as a strong conclusion: raw N and trust indicator are always visible.
- Show the whole picture at a glance via a **matchup matrix** across the team's decks and the gauntlet.
- Direct testing effort: the **coverage tracker** surfaces thin matchups, weighted by expected metagame,
  and ties them to test assignments ([playtesting-methodology §2–3](../domain/playtesting-methodology.md)).

## From factors to weight

Each `GameLog` records four confidence factors, each a small enum mapped to a 0–1 sub-score
([ADR-0005](../decisions/0005-confidence-weight-model.md)):

| Factor | Meaning | Low value ↔ High value |
|---|---|---|
| `skillParity` | How evenly matched the pilots were | lopsided ↔ evenly matched |
| `seriousness` | How focused/serious the games were | casual ↔ tournament-serious |
| `deckMaturity` | How tuned/final both decks were | experimental brew ↔ final list |
| `pilotFamiliarity` | How well the pilot knew the deck | first games ↔ deeply familiar |

These combine into `confidenceWeight ∈ [0,1]` using the **single formula defined in
[ADR-0005](../decisions/0005-confidence-weight-model.md)** (exact combination finalized in phase-06 and
covered by table-driven tests). This feature **consumes** that weight; it does not define a different one.

## Matchup aggregation

For a pairing `(ourDeck or ourHero) vs (opponentDeck or opponentHero/archetype)`, scoped by team and format
(and optionally a single event), over the relevant non-archived `GameLog`s, compute
([ADR-0005](../decisions/0005-confidence-weight-model.md)):

- **Weighted win rate** = `Σ(weightᵢ · winᵢ) / Σ(weightᵢ)` where `winᵢ ∈ {1, 0}` (draws handled per the
  aggregation rules below).
- **Raw N** = count of games — **always displayed**.
- **Effective sample** = `Σ(weightᵢ)` — a trust-adjusted sample size.
- **Trust indicator** = a `low` / `medium` / `high` bucket derived from the **effective sample** (thresholds
  finalized in phase-06, kept in one well-tested place).

Aggregation is derived from `GameLog` (the source of truth); it may be materialized later for performance
but must stay consistent with the logs.

### Worked example

Four games logged for **our Kassai** vs **opponent Fang**, best-of-1:

| Game | Result (our side) | confidenceWeight | winᵢ |
|---|---|---|---|
| 1 | Win | 0.9 | 1 |
| 2 | Win | 0.8 | 1 |
| 3 | Loss | 0.5 | 0 |
| 4 | Win | 0.2 | 1 |

- Raw N = **4**
- Effective sample = `0.9 + 0.8 + 0.5 + 0.2` = **2.4**
- Weighted win rate = `(0.9·1 + 0.8·1 + 0.5·0 + 0.2·1) / 2.4` = `1.9 / 2.4` ≈ **79%**
- Naïve (unweighted) win rate would be `3/4 = 75%` — the weighting rewards the trustworthy wins and
  discounts the low-confidence game.
- With an effective sample of only 2.4, the **trust indicator reads `low`**: the 79% is a hunch, not a
  conclusion, and the UI shows it as such (e.g. "79% · N=4 · low trust").

## Coverage tracker

The coverage tracker answers "what should we test next?" for an event's gauntlet
([playtesting-methodology §2–3](../domain/playtesting-methodology.md)):

- For each gauntlet target (reference deck / hero / archetype), show the current matchup's raw N, effective
  sample, weighted win rate, and trust indicator for each of our candidate decks.
- Flag matchups **below a confidence/sample threshold** (low trust or thin N) as **under-covered**.
- **Prioritize** under-covered matchups by the gauntlet's `expectedMetaShare` — the bogeyman with high field
  share and low coverage rises to the top.
- Show **who is assigned** to each thin matchup, linking to `TestAssignment` in
  [`testing-queue.md`](testing-queue.md) — closing the "nobody pilots the bogeyman" loop.

## Data

Consumes, does not own, most of these — see [data-model.md](../architecture/data-model.md).

- **GameLog** — the source rows (`confidenceFactors`, derived `confidenceWeight`, result, sides, format,
  optional event). Owned by [`game-logging.md`](game-logging.md).
- **Matchup** — *derived / aggregated*, not necessarily a stored table:
  `(deckA/heroA vs deckB/heroB, format, [event])` → `{ weightedWinRate, rawSampleCount, effectiveSample,
  trustIndicator }`. May be materialized for performance; source of truth is `GameLog`.
- **GauntletEntry** (with `expectedMetaShare`) and **Event** — for scoping and coverage prioritization
  (from [`events-and-gauntlets.md`](events-and-gauntlets.md)).
- **TestAssignment** — for the "who's on it" column (from [`testing-queue.md`](testing-queue.md)).

## Behavior & rules

- **Raw N is never hidden.** Weighted win rate, raw N, effective sample, and trust indicator are surfaced
  together, always.
- **Aggregation is read-only** and derived from current, non-archived logs; editing/archiving a `GameLog`
  updates the aggregates.
- **Scoping** is mandatory: every aggregate is filtered by the verified `teamId` and a `formatId`, and
  optionally one `eventId`. Cross-format and cross-event games are never silently merged.
- **By-deck vs by-hero:** the matrix can aggregate opponents by specific reference deck or by hero/archetype
  (per [ADR-0002](../decisions/0002-decks-as-links.md), meta aggregates by hero/identity as well as deck).
- **Draw handling** and the exact trust-indicator thresholds and formula live in
  [ADR-0005](../decisions/0005-confidence-weight-model.md) / phase-06, in one tested module.

## API surface

Indicative REST per [api-conventions.md](../architecture/api-conventions.md); `teamId` from verified
context. These are read-only aggregation endpoints.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/matchups` | Aggregated matchups (required `?formatId=`; optional `?eventId=&ourDeckId=&byHero=true`) |
| `GET` | `/api/matchups/matrix` | Full matrix payload (our decks × gauntlet / opponents) for the matrix UI |
| `GET` | `/api/matchups/coverage` | Coverage tracker (requires `?eventId=`): per-matchup N, effective sample, trust, and assignment refs |

Responses include, per cell: `weightedWinRate`, `rawSampleCount`, `effectiveSample`, `trustIndicator`.
Bodies validate against Zod schemas in `packages/shared`.

## UI / UX

- **Matchup matrix** — the centerpiece: rows = our decks, columns = gauntlet / opponents. Each cell shows
  the weighted win rate with raw N and a color-coded trust badge (low/medium/high). Toggle **by deck** ↔
  **by hero**; scope selectors for **format** and **event**.
- **Mobile-first & responsive:** the matrix scrolls horizontally with a sticky first column, or collapses
  to a condensed per-row list on small screens ([frontend §Mobile](../architecture/frontend.md)).
- **Cell drill-down:** tapping a cell reveals the underlying games, the factor breakdown, and the
  computation (so the number stays explainable). Card references support hover/press preview.
- **Coverage view:** a sorted list of under-covered matchups (by `expectedMetaShare`), each with its trust
  badge and the assignee(s), with a one-tap link to create/assign a test in
  [`testing-queue.md`](testing-queue.md).
- **Trust is visually unmissable:** a strong win rate over a low effective sample is styled as tentative,
  never as a confident green.

## Tenancy & permissions

All aggregation is filtered server-side by the verified active `teamId`; no endpoint returns cross-team
data, and cross-tenant reads return `404`. Aggregates are read-only for all roles (members and admins alike
can view). See [multi-tenancy.md](../architecture/multi-tenancy.md).

## Edge cases

- **Zero games:** matchup shows raw N = 0, no win rate, trust `low` (or "no data"); coverage lists it as
  fully uncovered.
- **All low-confidence games:** high raw N but small effective sample → trust stays `low`; the discrepancy
  is exactly what the model is meant to expose.
- **Single lopsided sample:** N = 1 never reads as `high` trust regardless of weight.
- **Opponent identified only by archetype label:** still aggregates under that archetype in the by-hero /
  by-archetype view.
- **Games spanning multiple formats/events:** never merged across scopes; each scope aggregates
  independently.
- **A game edited/archived after aggregation:** aggregates recompute (or the materialized view is
  invalidated); numbers stay consistent with current logs.

## Testing notes

Follow [testing-strategy.md](../architecture/testing-strategy.md). This is called out as a
**signature-feature test area**.

- **Aggregation math:** given a crafted set of `GameLog`s with known weights and results, assert exact
  weighted win rate, raw N, effective sample, and trust-indicator bucket — including the worked example
  above (N=4, effective 2.4, ≈79%, low trust).
- **Trust bucketing:** boundary tests around the low/medium/high thresholds.
- **Coverage tracker:** given games + a gauntlet, assert which matchups fall below threshold and their
  ordering by `expectedMetaShare`.
- **Scoping / tenant isolation:** aggregates never cross teams, formats, or events; a user in team A cannot
  read team B's matchups (expect `404`/empty), including with a forged `teamId`.
- **Consistency:** archiving/editing a game changes the aggregate as expected.

## Out of scope

- **Defining** the factor→weight formula and trust thresholds — owned by
  [ADR-0005](../decisions/0005-confidence-weight-model.md) / phase-06.
- **Logging** games and confidence factors — see [`game-logging.md`](game-logging.md).
- **Creating** test assignments — see [`testing-queue.md`](testing-queue.md).
- Full statistical confidence intervals (Bayesian/CI) — deferred per
  [ADR-0005](../decisions/0005-confidence-weight-model.md).

## See also

- [ADR-0005 confidence-weight-model](../decisions/0005-confidence-weight-model.md) ·
  [ADR-0002 decks-as-links](../decisions/0002-decks-as-links.md)
- [playtesting-methodology.md](../domain/playtesting-methodology.md) (§1–3) ·
  [flesh-and-blood.md](../domain/flesh-and-blood.md)
- [data-model.md](../architecture/data-model.md) · [multi-tenancy.md](../architecture/multi-tenancy.md) ·
  [api-conventions.md](../architecture/api-conventions.md) · [frontend.md](../architecture/frontend.md)
- [`game-logging.md`](game-logging.md) · [`events-and-gauntlets.md`](events-and-gauntlets.md) ·
  [`testing-queue.md`](testing-queue.md) · [`dashboard.md`](dashboard.md) ·
  [`gameplans-and-deck-selection.md`](gameplans-and-deck-selection.md)
- Implementing phase: [`phase-07-matchups-and-coverage.md`](../plans/phase-07-matchups-and-coverage.md)
</content>
