# ADR-0002: Decks are links, not card lists

- **Status:** Accepted (2026-07-11)
- **Context:** Decks could be stored as full card lists (like a deck builder) or referenced by link to a
  tool the team already uses (e.g. Fabrary). There are no sanctioned APIs to reliably import third-party
  deck contents, and building/maintaining a deck builder is large scope. The user explicitly chose
  reference-by-link.

## Decision

A **Deck** is a **link-only** entity: `{ game, format, hero/identity, externalUrl, metadata }`. TeamBrewer
does **not** store deck card-lists, does **not** build decks, and does **not** scrape deck contents. This
applies to both the team's own decks and reference/gauntlet (opponent) decks.

To preserve collaboration value without stored lists:
- A rich **card database** (global per game) powers autocomplete and hover-preview, so cards can be
  **referenced** anywhere (suggestions, game-plans, primers).
- **Card-test suggestions** reference cards from the card DB ("try X over Y in this deck") without the app
  validating the deck's contents.
- A manual **deck iteration log** captures changes over time in prose, since diffs can't be computed.

## Consequences

- Much simpler data model and UI; no import/parse/version-diff machinery; ToS-safe.
- The app is a **collaboration layer over decks-as-links**, not a deck builder.
- Cannot auto-validate legality or compute automatic version diffs — accepted; humans own the list in the
  linked tool.
- Matchups/meta aggregate by **hero/identity** (structured) and by deck entity, not by card composition.

## Alternatives considered

- **Store full card lists / build decks in-app** — rejected: large scope, redundant with existing tools,
  and no reliable import path.
- **Best-effort scraping of deck pages** — rejected: fragile and a ToS risk. See
  [ADR-0007](0007-external-data-approach.md).
