# Feature: Decks

## Summary

A **Deck** is a **link-only** entity — `{ hero/identity, format, external link, metadata }` — with **no
stored card list, no deck builder, and no scraping** of the linked tool's contents
([ADR-0002](../decisions/0002-decks-as-links.md)). Decks are the collaboration anchor for the whole app:
they hang off events, carry a status lifecycle and visibility, and keep a manual **iteration log**.
Reference decks represent opponent/meta archetypes for gauntlets.

## Goals & value

- Let members register the decks they're working on without rebuilding tools they already use (Fabrary,
  etc.) — the app is a **collaboration layer over decks-as-links**
  ([ADR-0002](../decisions/0002-decks-as-links.md)).
- Provide structured, aggregable fields (**hero, format, status**) so matchups and meta can be tracked by
  hero/deck even without card lists ([flesh-and-blood](../domain/flesh-and-blood.md)).
- Support both **our decks** and link-only **reference/gauntlet decks** (opponent archetypes).
- Preserve iteration history in prose since automatic diffs are impossible.

## User stories

- As a **member**, I can create a deck with a hero, format, external link, name, tags, notes, and
  visibility.
- As a **member**, I can keep a deck a **private draft** until it's ready to share with the team.
- As a **member**, I can move a deck through its **status** lifecycle as testing progresses.
- As a **member**, I can add **iteration log** entries describing changes ("-2 X, +2 Y after event").
- As a **team-admin**, I can create **reference decks** (opponent archetypes) for the gauntlet and moderate
  others' decks.
- As a **member**, I can browse/filter the team's decks by hero, format, status, and tags.

## Data

From [data-model](../architecture/data-model.md#decks-link-only--see-adr-0002):

- **Deck** `{ id, teamId, name, gameId, formatId, heroId?, externalUrl, source, ownerId,
  status: 'exploratory' | 'testing' | 'tournament_ready' | 'retired', visibility: 'team' | 'private',
  isReference (gauntlet/opponent archetype vs our deck), tags[], notes, archivedAt? }`
- **DeckIterationEntry** `{ id, deckId, authorId, body, createdAt }` — manual changelog; **there is no
  stored card list**.

`heroId`/`formatId` reference per-game identity/format data ([card-database](card-database.md)); `source` is
the recognized link provider (see below). Do not add card-list fields.

## Behavior & rules

### Status lifecycle

```mermaid
flowchart LR
  exploratory --> testing
  testing --> tournament_ready
  tournament_ready --> retired
  testing --> retired
  exploratory --> retired
  tournament_ready --> testing
```

- Transitions are unconstrained forward/back among the four states except `retired`, which is a terminal
  "no longer worked on" state a user can reopen to `testing` if needed.
- Status is independent of `archivedAt` (soft-delete). Retiring keeps the deck and its history; archiving
  hides it.

### Visibility

- `private` = a personal draft visible only to the **owner** (and moderating team-admins). `team` = visible
  to all team members. Owners flip visibility when ready.

### Reference decks

- `isReference = true` marks a deck as an **opponent/meta archetype** (link-only) used by gauntlets and as a
  side in game logs — it is still just a link + metadata, never a stored list.

### Deck-link recognition (best-effort, ToS-safe)

- On create/edit, the app does **best-effort recognition** of the `externalUrl` provider (e.g. Fabrary) via
  the adapter's optional `recognizeDeckUrl` to set a friendly `source` label and, if the URL exposes one, a
  provider `externalId`. It **never fetches or parses the deck's contents** — recognition is
  pattern-matching on the URL only ([game-abstraction](../architecture/game-abstraction.md),
  [ADR-0007](../decisions/0007-external-data-approach.md)).
- Unrecognized URLs are still accepted with a generic `source`.

### Validation & permissions

- `externalUrl` must be a valid URL; `formatId`/`heroId` must belong to the team's game.
- Owners edit/retire/archive their own decks; **team-admins can moderate all** decks in their team
  ([multi-tenancy](../architecture/multi-tenancy.md#roles--capabilities)).

| Action | Owner | Team-admin | Other member |
|---|---|---|---|
| Create own deck | ✅ | ✅ | ✅ |
| Edit / retire / archive | ✅ | ✅ (moderation) | ❌ |
| Add iteration entry | ✅ | ✅ | ❌ (comments instead) |
| Create reference deck | ✅ | ✅ | ✅ |
| View `private` draft | ✅ | ✅ | ❌ |
| View `team` deck | ✅ | ✅ | ✅ |

## API surface

Per [api-conventions](../architecture/api-conventions.md); `teamId` from verified context, never the body:

- `GET /api/decks?heroId=&formatId=&status=&isReference=&tag=&visibility=&limit=&cursor=` — list (cursor
  pagination); `private` drafts of other users are excluded.
- `POST /api/decks` — create (server stamps `teamId`, `gameId`, `ownerId`; runs URL recognition).
- `GET /api/decks/:deckId` — detail.
- `PATCH /api/decks/:deckId` — update name/status/visibility/tags/notes/externalUrl.
- `DELETE /api/decks/:deckId` — soft-delete (archive).
- `GET /api/decks/:deckId/iteration-entries` / `POST /api/decks/:deckId/iteration-entries` — changelog.

## UI / UX

Mobile-first (see [frontend](../architecture/frontend.md)):

- **Deck list** with hero/format/status/tag filters and a private-vs-team indicator.
- **Create/edit form:** hero picker (autocomplete) and format picker from the active game's reference data,
  external-link field with live provider recognition, tags, notes, visibility toggle, status selector.
- **Deck detail:** metadata, a prominent **"open external list"** link, the **iteration log** timeline, and
  (via [collaboration-core](collaboration-core.md)) comments.
- No card-list UI, no builder — reflect the link-only model clearly.

## Tenancy & permissions

Every deck carries a non-null `teamId`, stamped from the verified context and never the body; all queries
are `teamId`-scoped per [multi-tenancy](../architecture/multi-tenancy.md). `heroId`/`formatId` reference the
team's **game** data. Cross-team foreign keys (e.g. a deck referencing another team's hero/format, or later a
`GameLog` referencing a deck) are rejected; the mechanism is not re-explained here.

## Edge cases

- Duplicate `externalUrl` within a team -> allowed but surfaced as a soft warning (different owners may track
  the same list).
- Editing `externalUrl` to a new provider -> re-run recognition; recognition failure is non-blocking.
- Deck referenced by an event/gauntlet/game log is retired or archived -> keep it (soft-delete) so history
  and aggregates survive; hide from active pickers.
- A `private` deck referenced in a `team`-visible context -> guard so drafts don't leak metadata to
  non-owners.
- Reference deck without a `heroId` -> allowed via an `archetypeLabel` on the referencing side
  ([data-model](../architecture/data-model.md#events--gauntlets)); the deck itself still needs a valid link
  or label.

## Testing notes

Per [testing-strategy](../architecture/testing-strategy.md):

- **Integration:** deck CRUD scoped to team; `teamId`/`gameId`/`ownerId` stamped server-side; status
  transitions; visibility gating (non-owner cannot fetch another user's private draft); iteration entries
  are append-only and authored.
- **Tenant isolation (mandatory):** a user in team A cannot read/write team B's decks even with a forged
  `teamId` (403/404); cross-team `heroId`/`formatId` references rejected.
- **Deck-link recognition:** unit-test provider recognition is **URL-pattern only** and never fetches
  contents; unrecognized URLs still accepted.
- **AuthZ:** non-owner member cannot edit/retire others' decks; team-admin moderation works.
- **Validation:** invalid URL / wrong-game format or hero rejected with the error envelope.

## Out of scope

- **In-app deck building / stored card lists** — cut ([ADR-0002](../decisions/0002-decks-as-links.md)).
- **Scraping or importing deck contents / legality validation / auto version-diffs** — cut
  ([ADR-0002](../decisions/0002-decks-as-links.md), [ADR-0007](../decisions/0007-external-data-approach.md)).
- **Tech packages** (named card groups) — cut
  ([feature-catalog](../product/feature-catalog.md#explicitly-cut-out-of-scope)).
- Game logs, matchups, gauntlets, and game-plans that *reference* decks live in their own specs.

## See also

- [ADR-0002: Decks are links, not card lists](../decisions/0002-decks-as-links.md) ·
  [ADR-0007: External data approach](../decisions/0007-external-data-approach.md)
- [Data model](../architecture/data-model.md) · [Game abstraction](../architecture/game-abstraction.md) ·
  [Multi-tenancy](../architecture/multi-tenancy.md)
- [Card database](card-database.md) · [Events & gauntlets](events-and-gauntlets.md) ·
  [Game logging](game-logging.md) · [Game-plans & deck selection](gameplans-and-deck-selection.md) ·
  [Collaboration core](collaboration-core.md)
- Implementing phase: [phase-03 Decks](../plans/phase-03-decks.md)
