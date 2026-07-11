---
name: working-with-card-data
description: Use when implementing or changing card-data sync, card search/autocomplete, hover-preview, or anything touching the global per-game card database. Ensures sanctioned sources, adapter mapping, and idempotent sync.
---

# Working with Card Data

Card data is **global reference data per game** that powers autocomplete, hover-preview, card detail, and
card references. It is **not** deck contents (decks are links —
[ADR-0002](../../../docs/decisions/0002-decks-as-links.md)). Background:
[card-data-sources](../../../docs/domain/card-data-sources.md).

## Rules

- **Sanctioned sources only, no scraping** ([data-sources rule](../../rules/data-sources.md)):
  - FaB: [the-fab-cube/flesh-and-blood-cards](https://github.com/the-fab-cube/flesh-and-blood-cards)
    (open JSON/CSV). Pull the **exact schema** from the repo's `documentation/json-schemas.md` at build
    time — treat it as authoritative. Confirm license; attribute in-app.
  - Riftbound (later): [Riftcodex](https://riftcodex.com/) open API; confirm fields/terms/rate limits.
- **Sync into our DB; don't live-proxy.** Command + scheduled job; idempotent **upsert by stable id**
  (`gameId` + source `externalId`). Store a **data version/source** for "card data as of …".
- **Map via the game adapter.** Each game maps its raw records → the normalized `Card` model
  ([game-abstraction](../../../docs/architecture/game-abstraction.md)). No FaB-specific fields leak into
  shared/core.

## Card identity & search

- FaB card identity for deck/reference purposes is effectively **name + pitch** (a named card may exist at
  multiple pitch values). Autocomplete and pickers should present name + pitch clearly.
- Provide a fast search endpoint (indexed on `(gameId, name)`), filtered to the **active team's game**.

## UX

- **Autocomplete** pickers wherever a card is referenced (suggestions, game-plans, primers).
- **Hover/press preview** showing card details/image. See
  [frontend](../../../docs/architecture/frontend.md) and
  [card-database](../../../docs/features/card-database.md).

## Testing

- Unit-test the adapter mapping with a small fixture dataset.
- Integration-test sync **idempotency** (running twice changes nothing) and versioning.
- Never hit the live source in tests — use fixtures.
