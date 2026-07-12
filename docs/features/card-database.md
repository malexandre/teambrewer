# Feature: Card Database

## Summary

A **global, per-game** card reference database, synced from **sanctioned open sources** (the-fab-cube for
Flesh and Blood) through the **game adapter**. It powers autocomplete pickers, hover/press image previews,
and card references embedded elsewhere (suggestions, game-plans, primers). It is **not** deck
contents — decks are links ([ADR-0002](../decisions/0002-decks-as-links.md)). See
[ADR-0007](../decisions/0007-external-data-approach.md) and
[card-data-sources](../domain/card-data-sources.md).

## Goals & value

- Give every card-referencing feature a fast, consistent, offline-tolerant card source without live-hammering
  third parties ([card-data-sources](../domain/card-data-sources.md)).
- Preserve collaboration value under the link-only deck model: cards can be **referenced** even though card
  lists are never stored ([ADR-0002](../decisions/0002-decks-as-links.md)).
- Stay **ToS-safe**: sanctioned open data only, attributed, no scraping
  ([ADR-0007](../decisions/0007-external-data-approach.md)).
- Keep card knowledge **game-agnostic in core** by mapping each game's schema through its adapter
  ([game-abstraction](../architecture/game-abstraction.md)).

## User stories

- As a **member**, I can search cards by name (and pitch for FaB) with fast autocomplete.
- As a **member**, I can hover or press a referenced card anywhere to preview its image (which conveys the
  card's stats and text).
- As a **member**, I can see **when the card data was last synced** ("card data as of …") and its source.
- As an **instance-admin**, I can trigger a card-data sync (command + scheduled job).
- As a **member of a FaB team**, I only see FaB cards; a Riftbound team only sees Riftbound cards.

## Data

Global reference entities from [data-model](../architecture/data-model.md#game-reference-data-global-per-game--owned-by-adapter):

- **Game** `{ id, key, name }`
- **Card (lean)** `{ id, gameId, externalId (stable source id), name, pitch?, imageUrl?, archivedAt? }` —
  unique on `(gameId, externalId)`; searchable index on `(gameId, name)`. Cards are reference data only
  (decks are links, [ADR-0002](../decisions/0002-decks-as-links.md)), so the model stores just enough to
  reference a card by search/autocomplete and show its image — **no** combat stats, format legality, or
  printings (the card **image** conveys those; the matchup/confidence math never reads card stats). The
  adapter maps source -> this normalized model. *(Lean model decided in phase-02; a richer card can be
  reintroduced by a future phase + ADR if a feature needs structured stats.)*
- **CardDataVersion** `{ gameId, sourceName, sourceUrl, sourceVersion, lastSyncedAt, cardCount }` — one row
  per game; drives "card data as of …".
- **Hero** / **Format** — sibling per-game reference data (owned by the adapter; consumed by
  [decks](decks.md) and events). Heroes are derived from the synced card dataset.

These are **global** (no `teamId`) but **game-filtered** — see
[data-model](../architecture/data-model.md#global-vs-team-scoped). Pull the **exact** FaB field list from
the source schema at build time (phase-02); do not invent fields.

## Behavior & rules

### Sync

- A **card-sync job** (CLI command + scheduled) fetches the latest sanctioned dataset/release, maps raw
  records through the **game adapter** (`fetchCardSource` -> `mapCard`), and **upserts by stable id**
  (`gameId` + `externalId`) — **idempotent**: running twice changes nothing.
- Store a **data version / source** (`sourceVersion`) so the UI can show "card data as of …" and attribute
  the source.
- Sync is **global** (not per-team). Confirm the source's license/attribution before shipping.
- No scraping, no live-proxying — see [ADR-0007](../decisions/0007-external-data-approach.md) and the
  [working-with-card-data skill](../../.claude/skills/working-with-card-data/SKILL.md).

### Identity & search

- **FaB card identity is effectively `name + pitch`** — the same name can exist at multiple pitch values.
  Search and autocomplete must present **name + pitch** clearly (pitch shown by color: red 1 / yellow 2 /
  blue 3, see [flesh-and-blood](../domain/flesh-and-blood.md)).
- Search is filtered to the **active team's `gameId`**, indexed on `(gameId, name)`.
- The concept of identity is game-specific and resolved via the adapter (`cardIdentity`); core does not
  hard-code pitch semantics ([game-abstraction](../architecture/game-abstraction.md)).

### Permissions per role

| Action | Instance-admin | Team-admin | Member |
|---|---|---|---|
| Search / preview a card (own team's game) | ✅ | ✅ | ✅ |
| Trigger card-data sync | ✅ | ❌ | ❌ |

## API surface

Per [api-conventions](../architecture/api-conventions.md); reference endpoints are **game-filtered by the
active team's `gameId`** (not `teamId`-scoped):

- `GET /api/cards?query=&pitch=&limit=&cursor=` — search/autocomplete (keyset/cursor-paginated).
- `GET /api/cards/:cardId` — a single card (404 for archived or another game's card).
- `GET /api/formats` / `GET /api/heroes` — the active game's formats/identities (for pickers).
- `GET /api/card-data/version` — current `sourceVersion` + last-synced timestamp + source attribution.
- `POST /api/admin/card-data/sync` — trigger sync (instance-admin; idempotent upsert).

## UI / UX

Mobile-first (see [frontend](../architecture/frontend.md#card-ux)):

- **Autocomplete card picker** (name + pitch for FaB) reused wherever a card is referenced.
- **Hover/press preview** showing the card **image** (which conveys stats and text) with its name + pitch,
  anywhere a card is referenced (suggestions, game-plans, primers). The image preview doubles as the "detail"
  — there is no separate rich detail page in the lean model.
- A visible **"card data as of …"** indicator with source attribution.
- Card data is a good PWA offline-cache candidate (read-only) — see
  [frontend](../architecture/frontend.md).

## Tenancy & permissions

Card/Hero/Format/Game are **global reference data**, so they carry no `teamId`. They are still
**game-filtered**: a team reads only **its game's** reference data, filtered by the team's `gameId` — see
[multi-tenancy](../architecture/multi-tenancy.md#global-non-scoped-data). The `TeamContextGuard` supplies the
verified team (hence `gameId`); the sync job is global and admin-only.

## Edge cases

- Source unreachable/rate-limited during sync -> fail safely, keep the previous dataset, surface the error;
  do not partially corrupt (transactional upsert).
- Source schema changes -> adapter mapping must be re-derived from the authoritative schema at build time.
- Card exists at multiple pitch values -> treated as distinct search results; identity = name + pitch.
- Card removed from the source in a later release -> keep the row (soft/flag) so historical references and
  aggregates survive; do not hard-delete referenced cards.
- Riftbound team on an instance that has only synced FaB -> that team sees an empty card DB until its game's
  sync runs.
- Very large result sets -> cursor pagination + minimal autocomplete payload.

## Testing notes

Per [testing-strategy](../architecture/testing-strategy.md) and the
[working-with-card-data skill](../../.claude/skills/working-with-card-data/SKILL.md):

- **Unit:** adapter `mapCard` mapping against a small **fixture** dataset (never hit the live source).
- **Integration:** sync **idempotency** (run twice -> no changes) and version stamping; search is
  `(gameId, name)`-indexed and filtered to the game.
- **Game filtering:** a FaB team's card queries never return Riftbound cards (and vice-versa).
- **Validation:** Zod schemas for search params and responses; error envelope on bad input.

## Out of scope

- **Card prices** — cut ([feature-catalog](../product/feature-catalog.md#explicitly-cut-out-of-scope));
  TeamBrewer is a testing/meta tool, not a collection/finance tool.
- **Deck contents / deck building** — decks are links ([ADR-0002](../decisions/0002-decks-as-links.md)).
- **Automated external meta feeds / scraping** — cut
  ([ADR-0007](../decisions/0007-external-data-approach.md)).
- **Legality enforcement** — legality flags are reference context only, not a validation engine
  ([flesh-and-blood](../domain/flesh-and-blood.md)).

## See also

- [ADR-0007: External data — sanctioned card data only](../decisions/0007-external-data-approach.md) ·
  [ADR-0002: Decks are links](../decisions/0002-decks-as-links.md)
- [Card data sources](../domain/card-data-sources.md) · [Flesh and Blood](../domain/flesh-and-blood.md) ·
  [Game abstraction](../architecture/game-abstraction.md)
- [working-with-card-data skill](../../.claude/skills/working-with-card-data/SKILL.md)
- [Decks](decks.md) · [Frontend](../architecture/frontend.md)
- Implementing phase: [phase-02 Card Database](../plans/phase-02-card-database.md)
