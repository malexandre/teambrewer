# ADR-0005: Confidence-weighted results model

- **Status:** Accepted (2026-07-11) — formula to be refined during phases 05/06
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

These combine into `confidenceWeight ∈ [0,1]` (exact combination — e.g. weighted average or product —
finalized in phase-06 and covered by table-driven tests). Free-text `learnings`, plus optional
`winType`/`lossReason` tags, are also captured but do not affect the weight.

**Matchup aggregation** (scoped by team, format, optional event), over the relevant GameLogs:
- **Weighted win rate** = `Σ(weightᵢ · winᵢ) / Σ(weightᵢ)`
- **Effective sample** = `Σ(weightᵢ)`
- **Raw N** = count of games (**always shown alongside**)
- **Trust indicator** = low/medium/high bucket derived from effective sample (thresholds finalized in
  phase-06).

Sample size is **never hidden**. A high win rate over a tiny/low-confidence sample must read as untrusted.

## Consequences

- Results are trustworthy and self-explaining; the team can see *why* a number is or isn't reliable.
- Slightly more to fill in when logging — mitigated by sensible defaults and a fast mobile form.
- The formula and trust thresholds are tunable; keep them in one well-tested place.

## Alternatives considered

- **Single manual confidence rating** — rejected: loses the "why"; the user wanted structured factors.
- **Full statistical intervals (Bayesian/CI)** — deferred: more rigorous but harder to build and to read;
  the weighted model + shown sample is the pragmatic middle the user chose. Could layer CIs later.
