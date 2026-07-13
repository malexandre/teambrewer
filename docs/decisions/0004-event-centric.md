# ADR-0004: Event-centric organization

- **Status:** **Superseded by [ADR-0010](0010-meta-as-organizing-hub.md)** (2026-07-13). Originally Accepted
  (2026-07-11). The organizing hub moved from the **Event** to a team-scoped **Meta**; events are now
  lightweight and social. This ADR is retained for history.
- **Context:** Testing must be organized somehow — around formats, a flat library, or target tournaments.
  The user's goal is to find the best decks "for each important tournament," and pro prep is inherently
  event-shaped (see [`../domain/playtesting-methodology.md`](../domain/playtesting-methodology.md)).

## Decision

The **Event** (a target tournament: format + date + importance) is the central organizing concept.
Testing artifacts hang off an event: the **gauntlet** (field to beat), **expected metagame** weighting,
**test assignments**, **deck selection**, and the post-event **retrospective**. A **persistent per-team
library** of decks, games, matchups, primers, and card knowledge sits underneath and is reused across
events (data is not locked inside one event).

## Consequences

- Prep has a clear shape and endpoint (a confident deck choice + retrospective).
- Testing effort can be prioritized by expected metagame per event.
- Games and matchups can be filtered by event or viewed across the whole library.
- Requires an Event entity early enough that later modules (game logging, assignments, game-plans) can
  optionally reference it.

## Alternatives considered

- **Format-centric** — rejected: events are the real deadline/driver; formats are still a dimension/filter.
- **Flat library** — rejected: too little structure for deliberate tournament prep.
