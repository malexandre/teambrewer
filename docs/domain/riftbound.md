# Domain: Riftbound (built later)

Riftbound is Riot Games' *League of Legends* Trading Card Game. In TeamBrewer it is **designed-for but
not implemented in the first phases** — it exists to validate that the core is genuinely game-agnostic. A
team is bound to a single game (see [ADR-0008](../decisions/0008-multi-tenant-teams.md)); a Riftbound team
would use the Riftbound game adapter.

> This is a fast-moving, newer game. **Verify all specifics against official/community sources when the
> Riftbound adapter is actually built** (phase-12). Do not over-invest in Riftbound details now.

## Core structure (as understood during discovery)

- A deck is built around a **Legend** (the champion/identity — analogous to a FaB hero).
- Deckbuilding is constrained by **Domain** (color/faction axis) and cards carry a **Region** (LoL region).
- A deck fills a set of **zones** (commonly described as six zones in community builders).
- Cards have attributes such as name, cost/energy, might/power, type, tags, keywords, rarity, and set.

## Data source

- **[Riftcodex](https://riftcodex.com/)** — an open, unofficial REST API. Base URL observed:
  `https://api.riftcodex.com/api/`, with a `cards` endpoint supporting `limit`, `page`, and `set_id`
  filters, and search by champion/region/keyword. **It is an unofficial fan project, not affiliated with
  Riot** — confirm current endpoints, fields, rate limits, and terms at build time (see the API's `/docs`).
- Other community databases exist (Piltover Archive, riftbound.one, riftdecks.com) as cross-references.

## What this implies for TeamBrewer

- The **game-agnostic core** must not assume FaB concepts. Anything FaB-specific (the word "hero", pitch,
  FaB formats) lives behind the game adapter interface. Riftbound's "Legend/Domain/Region/zones" map onto
  the same adapter contract: identity, factions/affinities, formats, and card schema.
- **Decks stay link-only** for Riftbound too (Riftbound builders share decks by URL).
- The **card database is global per game**; a Riftbound team sees Riftbound cards/formats only.

See [`../architecture/game-abstraction.md`](../architecture/game-abstraction.md) for the adapter contract
that both FaB and Riftbound satisfy, and [`../plans/phase-12-riftbound-adapter.md`](../plans/README.md)
for the build phase.
