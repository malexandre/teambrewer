# Domain: Competitive Playtesting Methodology

The theory TeamBrewer is built on. These ideas — drawn from pro-team playtesting practice — justify the
signature features (confidence, coverage, event-centric prep). Design features to serve these principles.

## 1. Opinions must carry confidence tied to sample size

"This matchup is unwinnable" and "this matchup seemed unwinnable, but I only played it twice" are very
different claims. Good teams attach a **degree of confidence** to every read and grow that confidence with
**sample size**. A 55% win rate over 30 games is trustworthy; over 3 games it is a hunch.

→ **In TeamBrewer:** every game carries structured **confidence factors**; matchup win rates are
**confidence-weighted** and **always display the sample size** and a trust indicator. See
[`../features/confidence-and-matchups.md`](../features/confidence-and-matchups.md) and
[ADR-0005](../decisions/0005-confidence-weight-model.md).

### Why *structured* confidence (not a single slider)
A result is trustworthy for specific reasons: the pilots were evenly skilled, both played seriously, both
decks were tuned, and the pilot knew the deck. Capturing these as **factors** lets the team see *why* a
number is or isn't trustworthy — e.g. a win against a brand-new player with an untuned brew is low-value
even if it "counts." The user's own framing: a serious, well-played game between teammates is high
confidence; a win over a new player (where the win came from the skill gap, not the deck) is low
confidence.

## 2. Gauntlet coverage — someone must pilot the bogeyman

A recurring failure mode: nobody wants to play the field's best/most-hated deck, so the team never learns
the matchup from the other side. Teams fix this with **ground rules** and **assignments** — each member
tests specific decks/matchups, including the ones they don't want to play.

→ **In TeamBrewer:** the **gauntlet** defines the field to beat; **test assignments** hand out matchups;
the **coverage tracker** shows which matchups are still thin and who's on them. See
[`../features/events-and-gauntlets.md`](../features/events-and-gauntlets.md) and
[`../features/testing-queue.md`](../features/testing-queue.md).

## 3. Allocate practice by expected frequency

You don't have infinite reps. Practice time should track how often you expect to face each archetype, not
personal preference. Modern teams weight testing by **expected metagame share**.

→ **In TeamBrewer:** an event's gauntlet carries **expected metagame** percentages; the dashboard and
coverage tracker use them to prioritize "what to test next." See
[`../features/dashboard.md`](../features/dashboard.md).

## 4. Tech cards and matchup game-plans win close matchups

A matchup often swings on a few cards or a clear plan ("bring in X, sequence Y first"). Teams keep
**matchup game-plans** and propose **tech cards** that improve specific pairings without changing the core.

→ **In TeamBrewer:** **per-deck card-test suggestions** capture tech ideas with reasoning and status;
**game-plans** capture the written plan per (our deck × opponent archetype). See
[`../features/testing-queue.md`](../features/testing-queue.md) and
[`../features/gameplans-and-deck-selection.md`](../features/gameplans-and-deck-selection.md).

## 5. Communication is the #1 factor

The single biggest differentiator for successful teams — and where they most often fail — is
communication. Conclusions get lost in chat; the same debates repeat.

→ **In TeamBrewer:** threaded **comments + @mentions**, an **activity feed**, a **decisions log**, and
**primers** keep knowledge findable and durable. See
[`../features/collaboration-core.md`](../features/collaboration-core.md) and
[`../features/team-knowledge.md`](../features/team-knowledge.md).

## 6. Prep is event-shaped

Testing is not open-ended; it targets a specific tournament with a specific format and expected field, and
ends in a **deck choice** and a **retrospective** that makes the next event easier.

→ **In TeamBrewer:** the **event** is the organizing hub, ending in **deck selection** and a
**retrospective**. See [ADR-0004](../decisions/0004-event-centric.md).

---

### Sources
Pro-team playtesting articles on gauntlets, confidence intervals, sample size, and team communication;
data-driven meta/matchup analysis practice; existing match-tracking and deck tools. See the source list in
[`../product/feature-catalog.md`](../product/feature-catalog.md).
