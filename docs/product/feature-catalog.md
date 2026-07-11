# Feature Catalog

The complete feature set, how it was decided, and what was explicitly cut. This records the
**collaborative discovery pass** (web research into competitive TCG team tools + adjacent apps, plus
brainstorming) that produced the scope. Each module has its own spec in [`../features/`](../features/).

## How this was decided

Sources consulted during discovery (see also [`../domain/playtesting-methodology.md`](../domain/playtesting-methodology.md)):

- Pro-team playtesting literature (gauntlet coverage, confidence tied to sample size, communication as
  the #1 factor).
- Existing tools: [Moxfield](https://moxfield.com/) (deck sharing, comments, card packages),
  [MTG Match Tracker](https://www.tcgmatchtracker.app/magic) and VS Log (match logging with turn order,
  win/loss reasons, matchup analysis), [Untapped.gg](https://mtga.untapped.gg/en) (stats/analytics),
  meta/matchup platforms ([data-driven analysis](https://cardsrealm.com/en-us/articles/meta-shifts-and-matchup-data-how-competitive-tcg-analysis-is-redefining-tournament-strategy),
  practice allocated by expected frequency).
- Flesh and Blood community tools: [Fabrary](https://fabrary.net/), [FABREC](https://fabrec.gg/),
  meta trackers.

## Modules (in scope)

Legend: **Locked** = decided directly with the user early; **Core** = confirmed in discovery as
recommended and included; **Included** = optional in discovery, user chose to include.

| # | Module | Spec | Key capabilities | Origin |
|---|---|---|---|---|
| 1 | Accounts & Auth | [accounts-and-auth](../features/accounts-and-auth.md) | Invite-only, no-email setup/reset links, mandatory TOTP 2FA, backup codes | Locked |
| 2 | Teams & Membership | [teams-and-membership](../features/teams-and-membership.md) | Isolated workspaces, per-team roles, active-team switching | Locked |
| 3 | Card Database | [card-database](../features/card-database.md) | Search, autocomplete, hover-preview, card detail (global per game) | Locked |
| 4 | Decks | [decks](../features/decks.md) | Link-only decks; hero/format/metadata; status lifecycle; iteration log | Locked + Included |
| 5 | Events & Gauntlets | [events-and-gauntlets](../features/events-and-gauntlets.md) | Events hub; gauntlet; expected-metagame weighting; attendance/RSVP | Locked + Core + Included |
| 6 | Game Logging | [game-logging](../features/game-logging.md) | Match logging; confidence factors; first/second player; win-type/loss-reason tags | Locked + Included |
| 7 | Matchups & Coverage | [confidence-and-matchups](../features/confidence-and-matchups.md) | Confidence-weighted matchup matrix (+ raw N + trust); coverage tracker | Locked + Core |
| 8 | Testing Queue | [testing-queue](../features/testing-queue.md) | Per-deck card-test suggestions + status; voting/reactions; test assignments | Locked + Core + Included |
| 9 | Game-Plans & Deck Selection | [gameplans-and-deck-selection](../features/gameplans-and-deck-selection.md) | Per-matchup game-plans/"sideboard" guides; per-event deck selection/lock; retrospective | Core + Included |
| 10 | Collaboration Core | [collaboration-core](../features/collaboration-core.md) | Polymorphic comments; @mentions; activity feed; notification center (in-app) | Core |
| 11 | Team Knowledge | [team-knowledge](../features/team-knowledge.md) | Primers/wiki; decisions log; polls/voting | Core + Included |
| 12 | Dashboard | [dashboard](../features/dashboard.md) | Personal + team view: assigned tests, coverage gaps, upcoming events, recent results, "what to test next" | Locked |

## Explicitly cut (out of scope)

| Cut | Why |
|---|---|
| **Card prices** | This is a testing/meta tool, not a collection/finance tool. Adds a data dependency for no core value. |
| **Tech packages** (named card groups) | Low value given decks are link-only (no stored card lists to package). |
| **Automated external meta feeds / scraping** | No sanctioned APIs; fragile and a ToS risk. External context is referenced by link only. See [ADR-0007](../decisions/0007-external-data-approach.md). |
| **In-app deck building** | Decks are links to tools the team already uses. See [ADR-0002](../decisions/0002-decks-as-links.md). |
| **Live game engine / auto-import of results** | All results are logged by humans; keeps the app simple and game-agnostic. |
| **Public/open signup** | Access is admin-granted only. |

## Phasing

Modules are sequenced into build phases in [`../plans/README.md`](../plans/README.md). Inclusion here does
**not** mean "build in v1" — some modules land in later phases. Nothing in this catalog is v1-only; the
whole thing is a roadmap.
