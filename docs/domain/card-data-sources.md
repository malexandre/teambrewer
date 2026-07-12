# Domain: Card Data Sources

How TeamBrewer obtains **card reference data** (global per game). Card data powers autocomplete,
image hover-preview, and card references inside suggestions, game-plans, and primers. It is **not**
deck contents — decks are links (see [ADR-0002](../decisions/0002-decks-as-links.md)).

## Principles

- **Use sanctioned, open sources only.** No scraping of sites whose terms don't permit it. See
  [ADR-0007](../decisions/0007-external-data-approach.md) and
  [`../../.claude/rules/data-sources.md`](../../.claude/rules/data-sources.md).
- **Sync, don't live-proxy.** Import card data into our database on a schedule/command so the app is fast,
  works offline-ish (PWA), and doesn't hammer third parties. Attribute sources.
- **Card data is owned by the game adapter.** Each game defines its own card schema mapping into our
  normalized card model. See [`../architecture/game-abstraction.md`](../architecture/game-abstraction.md).

## Flesh and Blood — primary source

**[the-fab-cube/flesh-and-blood-cards](https://github.com/the-fab-cube/flesh-and-blood-cards)** — an
open-source JSON/CSV dataset of every FaB card, community-maintained.

- **Format:** JSON (easiest for general use) and CSV, with language subfolders (English default; also FR,
  DE, IT, ES). Stable versions are published via GitHub releases.
- **Schema:** documented in the repo at `documentation/json-schemas.md` and `documentation/csv-schemas.md`.
  Fields include a stable `unique_id`, name, pitch, cost, power/defense, types/subtypes/keywords, abilities
  and errata, rarity, artists, sets/printings (with foil variants), and per-format legality flags. **Pull
  the exact field list from the schema docs at build time** (phase-02) — treat them as authoritative.
- **Identity note:** in FaB, **name + pitch** is effectively the deck-relevant identity; a single named
  card can exist at multiple pitch values.
- **License:** confirm the repository's current license/attribution terms before shipping and attribute
  the source in-app.

Cross-references (do not scrape; useful for humans): official [Card Vault](https://cardvault.fabtcg.com/),
[Fabrary](https://fabrary.net/) (its card data derives from the same open dataset), FabDB.

## Riftbound — later

**[Riftcodex](https://riftcodex.com/)** open REST API (`https://api.riftcodex.com/api/`). Unofficial fan
project, not affiliated with Riot. Confirm endpoints/fields/rate-limits/terms at build time. See
[`riftbound.md`](riftbound.md).

## Sync strategy (implemented in phase-02)

- A **card-sync job** (command + scheduled) fetches the latest dataset/release, maps it through the game
  adapter into the normalized `Card` table, and upserts by stable id.
- Store a **data version/source** so the UI can show "card data as of …".
- The sync is **global** (not per-team); teams read the cards for their game.
- Keep the sync idempotent and covered by tests using a small fixture dataset.

See the module spec [`../features/card-database.md`](../features/card-database.md) and the phase plan for
details.
