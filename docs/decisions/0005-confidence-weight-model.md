# ADR-0005: Confidence-weighted results model

- **Status:** Accepted (2026-07-11); **formula finalized in phase-06 (2026-07-12)** — see "Finalized model" below;
  **aggregation (draw rule + trust thresholds) finalized in phase-07 (2026-07-12)** — see "Finalized aggregation" below
- **Context:** The signature idea: not all game results are equally trustworthy. A serious, well-played
  game between evenly-matched teammates on tuned decks is high-value; a win over a brand-new player with an
  untuned brew is low-value even though it "counts." Pro practice ties confidence to specifics and to
  sample size (see [`../domain/playtesting-methodology.md`](../domain/playtesting-methodology.md)). The
  user chose **structured factors → weight** with **weighted win rates + sample size shown**.

## Decision

Each **GameLog** records structured **confidence factors**, each a small enum mapped to a 0–1 sub-score:

- **skillParity** — how evenly matched the pilots were.
- **seriousness** — how serious/focused the games were (tournament-serious ↔ casual).
- **deckMaturity** — how tuned/final both decks were (final ↔ experimental brew).
- **pilotFamiliarity** — how well the pilot knew the deck.

These combine into `confidenceWeight ∈ [0,1]` (see "Finalized model" below). Free-text `learnings`, plus
optional `winType`/`lossReason` tags, are also captured but do not affect the weight.

### Finalized model (phase-06)

Each factor is a **3-level enum → sub-score `1.0` / `0.7` / `0.4`** (best / mid / worst), defaulting to its
best level so a fast save (accepting every default) yields a fully-trusted weight of `1.0`:

| Factor | best `1.0` | mid `0.7` | worst `0.4` |
|---|---|---|---|
| `skillParity` | `evenly_matched` | `minor_gap` | `major_gap` |
| `seriousness` | `tournament_serious` | `focused_practice` | `casual` |
| `deckMaturity` | `both_tuned` | `partially_tuned` | `experimental` |
| `pilotFamiliarity` | `knows_well` | `learning` | `first_time` |

The combination is a **weighted mean** — `skillParity 0.35`, `seriousness 0.25`, `deckMaturity 0.25`,
`pilotFamiliarity 0.15` (weights sum to 1) — so
`confidenceWeight = 0.35·s(skillParity) + 0.25·s(seriousness) + 0.25·s(deckMaturity) + 0.15·s(pilotFamiliarity)`.
All-best derives `1.00`; all-worst derives `0.40` (the documented floor); every combination stays within
`[0,1]`. The sub-scores and weights are the single tunable source of truth, implemented once in
`deriveConfidenceWeight()` in `packages/shared` (so the API derives it authoritatively and the web form
previews it live) and locked by table-driven tests. **Trust-indicator buckets are deferred to phase-07**
(matchup aggregation), which consumes the raw N + Σ weights this model produces.

**Matchup aggregation** (scoped by team, format, optional event), over the relevant GameLogs:
- **Weighted win rate** = `Σ(weightᵢ · winᵢ) / Σ(weightᵢ)` over **decisive** games
- **Effective sample** = `Σ(weightᵢ)` over **decisive** games
- **Raw N** = count of games (**always shown alongside**; includes draws)
- **Trust indicator** = low/medium/high bucket derived from effective sample.

Sample size is **never hidden**. A high win rate over a tiny/low-confidence sample must read as untrusted.

### Finalized aggregation (phase-07)

The aggregation layer (feature: confidence-and-matchups) is implemented once as pure functions in
`packages/shared` (`aggregateMatchup`, `trustIndicator`, `deriveGameOutcome`), locked by table-driven tests
and consumed by the API service. Two open points were finalized here **with the user**:

- **Draw handling.** A game is a **draw** when neither side won more games (a Bo1 `{0,0}` or a tied/timed
  match). A draw is **excluded from the weighted win rate**: its weight counts toward **neither** the
  numerator **nor** the effective sample. It still counts in **raw N**. So `effectiveSample = Σ(weightᵢ)`
  is over **decisive games only**, and raw N can exceed the games behind the rate. The win rate is `null`
  (no data) when a matchup has no decisive games. (Rejected alternatives: draw = ½ win, or draw = loss —
  both let a rare draw distort a small-sample rate; excluding keeps the rate a clean win-vs-loss reading.)
- **Trust-indicator thresholds** on the effective sample: **`low < 5`, `medium 5 ≤ x < 15`, `high ≥ 15`**.
  A single lopsided game (effective ≈ 1) and the feature's worked example (effective 2.4) both read `low`;
  `high` takes a substantial trusted sample, per the methodology's "55% over 30 games is trustworthy."
  Kept in one tunable place (`MATCHUP_TRUST_THRESHOLDS`).

**Coverage** flags a gauntlet matchup as under-covered when its effective sample is below a configurable
threshold (default: the `high` boundary — anything not yet high-trust), prioritized by the gauntlet's
**normalized** expected metagame share.

## Consequences

- Results are trustworthy and self-explaining; the team can see *why* a number is or isn't reliable.
- Slightly more to fill in when logging — mitigated by sensible defaults and a fast mobile form.
- The formula and trust thresholds are tunable; keep them in one well-tested place.

## Alternatives considered

- **Single manual confidence rating** — rejected: loses the "why"; the user wanted structured factors.
- **Full statistical intervals (Bayesian/CI)** — deferred: more rigorous but harder to build and to read;
  the weighted model + shown sample is the pragmatic middle the user chose. Could layer CIs later.
