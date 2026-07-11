# Rule: Data Sources

How TeamBrewer may obtain external data. Background:
[card-data-sources](../../docs/domain/card-data-sources.md) ·
[ADR-0007](../../docs/decisions/0007-external-data-approach.md).

## Allowed

- **Sanctioned open card data**, synced into our DB:
  - Flesh and Blood: [the-fab-cube/flesh-and-blood-cards](https://github.com/the-fab-cube/flesh-and-blood-cards)
    (open JSON/CSV; confirm license, attribute).
  - Riftbound (later): [Riftcodex](https://riftcodex.com/) open API (unofficial; confirm terms, attribute).
- **Links** to external decks/meta/tools (Fabrary, meta sites, official archive) — stored as URLs +
  light metadata only.

## Forbidden

- **Scraping** or automated harvesting of any site whose terms don't explicitly permit it (Fabrary,
  FABlazing, FaBTCGMeta, FABREC, official decklist archive, etc.).
- Importing/parsing third-party **deck contents**. Decks are links (see
  [ADR-0002](../../docs/decisions/0002-decks-as-links.md)).
- Live-proxying a third-party API on every request (sync into our DB instead; be a good citizen).

## Practices

- **Sync, don't hammer:** scheduled/command-driven import, idempotent upsert by stable id, store a data
  version, attribute the source in-app.
- **Verify at build time:** confirm current endpoints, fields, licenses, and rate limits against official
  docs before shipping any integration.
- If a new external integration is proposed, it must use a sanctioned API, be opt-in, and disclose its
  source and terms. When in doubt, **ask the user**.
