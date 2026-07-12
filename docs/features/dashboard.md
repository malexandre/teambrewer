# Feature: Dashboard

## Summary

The team's home surface: a **personal + team overview** that aggregates across modules so a member lands
and immediately knows what to do next. It shows **my assigned tests**, **coverage gaps**, **upcoming
events** with my attendance and deck selection, **recent results**, and a **"what to test next"**
recommendation that combines **expected-metagame weighting** with coverage gaps
([playtesting-methodology.md §3](../domain/playtesting-methodology.md)). The dashboard is **mostly a
read/aggregation surface** — it owns little to no new data and links out to the source modules for action.

## Goals & value

- Collapse "where do I even start?" into a single, prioritized view.
- Steer scarce practice toward what matters: expected field share × where the team's data is thinnest
  ([playtesting-methodology.md §3](../domain/playtesting-methodology.md)).
- Keep everyone oriented on the next event, their commitments, and momentum (recent results/activity).

## User stories

- As a grinder, I open the dashboard and see the games I'm assigned to test and a suggested next matchup.
- As a member, I see the upcoming event, whether I've RSVP'd, and whether I've recorded a deck selection.
- As a captain, I see team-wide coverage gaps at a glance to know where to push.
- As a member, I see recent results and team activity so I'm caught up.

## Data

The dashboard **reads and aggregates** existing entities; it does **not** introduce new persisted tables.
Sources (see [data-model.md](../architecture/data-model.md), all team-scoped):

| Widget | Reads from | Source module |
|---|---|---|
| My assigned tests | `TestAssignment` (assigneeId = me), `GameLog` (progress) | [testing-queue.md](testing-queue.md) |
| Coverage gaps | derived `Matchup` aggregates vs `GauntletEntry` thresholds | [confidence-and-matchups.md](confidence-and-matchups.md) |
| Upcoming events | `Event`, `Attendance` (mine), `DeckSelection` (mine) | [events-and-gauntlets.md](events-and-gauntlets.md), [gameplans-and-deck-selection.md](gameplans-and-deck-selection.md) |
| Recent results | `GameLog` (recent, team) | [game-logging.md](game-logging.md) |
| What to test next | `GauntletEntry.expectedMetaShare` × coverage (effective sample) gap | [confidence-and-matchups.md](confidence-and-matchups.md) + [events-and-gauntlets.md](events-and-gauntlets.md) |
| Team activity | `ActivityEvent`, unread `Notification` count | [collaboration-core.md](collaboration-core.md) |

### "What to test next" recommendation (the one piece of logic)

For the active/target event, rank gauntlet matchups by a **priority score** combining how much the team
expects to face an archetype with how little trustworthy data it has:

```
priority(matchup) = expectedMetaShare(archetype) × coverageGap(matchup)
coverageGap        = max(0, targetEffectiveSample − effectiveSample) / targetEffectiveSample
effectiveSample    = Σ(confidenceWeight) for the matchup   # see ADR-0005 / confidence-and-matchups
```

- `expectedMetaShare` comes from the event's `GauntletEntry` rows; `effectiveSample` and the trust bucket
  come from the confidence-weighted matchup aggregation. High expected share + thin/low-trust data ⇒ top of
  the list. This is a **presentation-time computation** over the source modules' data — the source of truth
  stays in `GameLog` and `GauntletEntry`.

## Behavior & rules

- **Scope selection:** the personal view centers on the caller; a team view aggregates across members. The
  recommendation targets the **next upcoming event** (or a user-picked event) and its format.
- **Read-only:** widgets link to the owning module to take action (log a game, RSVP, record a selection,
  open a matchup) rather than mutating here.
- **Freshness:** aggregates recompute on read (or from a cached matchup materialization if one exists —
  [confidence-and-matchups.md](confidence-and-matchups.md)); no dashboard-owned writes.
- **Empty states:** each widget degrades gracefully (no upcoming event, no assignments, no games yet).

## API surface

REST per [api-conventions.md](../architecture/api-conventions.md); `teamId` from the verified context. The
dashboard prefers thin **aggregation endpoints** that compose existing per-module reads.

**Implemented (phase-11):** two composite endpoints, split personal ↔ team rather than one blob:

```
GET /api/dashboard/me                    # the caller's personal overview (assignments, upcoming, results)
GET /api/dashboard/team?eventId=         # team overview: recommendation + coverage gaps + results + activity
```

The `/team` payload embeds the ranked recommendation (the earlier `what-to-test-next` idea) for its target
event (an explicit `?eventId=`, else the nearest upcoming). The ranking is **per opponent archetype** — one
row per gauntlet target, aggregating all our reps — matching the formula below and the coverage tracker
(decided with the user; not per our-deck × opponent pairing). The dashboard is also the **authenticated
landing at `/`** (the team roster moved to `/team`).

Backing per-module reads it may call instead of/alongside the composite:

```
GET /api/test-assignments?assigneeId=me&status=open
GET /api/events?upcoming=true            # + /attendance/me, /deck-selections/me
GET /api/game-logs?recent=true&limit=
GET /api/coverage?eventId=               # coverage tracker (confidence-and-matchups)
GET /api/activity?limit=  ·  GET /api/notifications?unreadOnly=true
```

All reads are scoped to the verified active team; `me` resolves to the authenticated user; `teamId` is
never taken from the body.

## UI / UX (mobile-first)

- **Card/widget grid** that stacks to a single column on phones; each widget has a title, a compact summary,
  and a "view all" link to its module.
- **Top priority:** "My assigned tests" and "What to test next" surface first for a grinder; each item is a
  one-tap deep link into the game-logging flow pre-filled with the matchup.
- **Upcoming event strip:** next event with date, my RSVP state, and my deck-selection state (with a nudge
  if missing).
- **Coverage gaps:** a condensed heat strip (well-tested → thin) linking to the full matchup matrix
  (responsive/horizontal-scroll per [frontend.md](../architecture/frontend.md)).
- **Activity + notifications:** a recent slice of the team feed and an unread badge.

## Tenancy & permissions

Follows [multi-tenancy.md](../architecture/multi-tenancy.md). Because the dashboard fans out across
modules, **every** aggregated read must be scoped to the verified active team — the aggregation layer must
not become a hole that leaks cross-team data. Personal widgets are additionally scoped to the caller
(`assigneeId`/attendance/selection = me). Team-wide widgets show only the active team. Respects each source
module's own permissions (e.g. `private` decks/primers hidden from others).

## Edge cases

- **No upcoming event:** the recommendation falls back to the persistent library (cross-event matchups) or
  shows an empty state prompting event creation.
- **New team, no data:** all widgets show onboarding empty states, not errors.
- **Gauntlet without expected-metagame shares:** the recommendation falls back to ranking purely by
  coverage gap and flags that shares are unset.
- **User in multiple teams:** the dashboard reflects only the **active team**; switching teams
  invalidates dashboard queries (team-scoped query keys, [frontend.md](../architecture/frontend.md)).
- **Ties in priority score:** break by higher `expectedMetaShare`, then lower `effectiveSample`.
- **Assignment referencing an archetype not in the current gauntlet:** still shown under "my assigned
  tests"; excluded from the event-scoped recommendation.

## Testing notes

Per [testing-strategy.md](../architecture/testing-strategy.md):

- **Tenant isolation (mandatory):** the composite/aggregation endpoints never return another team's
  assignments, games, coverage, events, or activity — a user in team A sees only team A (cross-tenant →
  empty/404), including via the fan-out endpoints.
- **Recommendation math:** table-driven tests over crafted gauntlet + `GameLog` datasets asserting the
  ranked order and priority scores (expected share × coverage gap), including the no-shares fallback and
  tie-breaking.
- **Personal scoping:** "my" widgets return only the caller's assignments/attendance/selection.
- **Empty/degraded states:** no event, no data, missing shares render without error.

## Out of scope

- Owning or persisting new domain data — the dashboard is a read/aggregation surface only.
- Configurable/custom dashboards or saved layouts.
- Charts/trends over time beyond the summary widgets (deeper analytics live in
  [confidence-and-matchups.md](confidence-and-matchups.md)).
- Email digests or any external delivery — awareness is in-app ([collaboration-core.md](collaboration-core.md)).

## See also

- [testing-queue.md](testing-queue.md) · [confidence-and-matchups.md](confidence-and-matchups.md) ·
  [events-and-gauntlets.md](events-and-gauntlets.md) · [game-logging.md](game-logging.md) ·
  [gameplans-and-deck-selection.md](gameplans-and-deck-selection.md) ·
  [collaboration-core.md](collaboration-core.md) · [team-knowledge.md](team-knowledge.md)
- [data-model.md](../architecture/data-model.md) · [multi-tenancy.md](../architecture/multi-tenancy.md) ·
  [api-conventions.md](../architecture/api-conventions.md) · [frontend.md](../architecture/frontend.md)
- [playtesting-methodology.md §3](../domain/playtesting-methodology.md) ·
  [ADR-0004 event-centric](../decisions/0004-event-centric.md)
- Implementing phase: [phase-11-dashboard](../plans/phase-11-dashboard.md)
