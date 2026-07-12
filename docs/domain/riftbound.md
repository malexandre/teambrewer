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

- **[Riftcodex](https://riftcodex.com/)** — an open, unofficial REST API. **Confirmed at build time
  (phase-12, 2026-07-13):** base URL `https://api.riftcodex.com`; list endpoint `GET /cards?page=<n>&size=<n>`
  (`size` max 100), paginated as `{ items, total, page, size, pages }`; also supports `set_id`/`sort`/`dir`.
  A card carries `id`, `name`, `riftbound_id`, `classification { type, supertype, rarity, domain[] }`,
  `attributes { energy, might, power }`, `media { image_url, artist, accessibility_text }`, `tags[]` (region
  + subtypes), `set`, `text`, and `metadata`. Card types are `Battlefield, Gear, Legend, Rune, Spell, Unit`
  (**`Legend`** is the identity); domains are `Body, Calm, Chaos, Colorless, Fury, Mind, Order`
  (`/index/card-types`, `/index/domains`). **No auth on reads.** It is an **unofficial fan project under
  Riot's fan content policy, not affiliated with Riot** — no explicit license/rate-limit text is published,
  so TeamBrewer **syncs the catalog once (never live-hammers) and attributes the source in-app**.
- The [Riftbound adapter](../plans/phase-12-riftbound-adapter.md) maps these into the lean `Card` (name +
  image; `pitch` is null — Riftbound has no pitch resource) and derives Legends into `Hero`, mapping
  **Domain → the class surface** and **Region (tags) → the talent surface**; card identity is name-only.
- Riftbound competitive play is **Best-of-three Constructed (Standard)**; Limited is Draft/Sealed — so the
  adapter's formats are `Standard` (constructed), `Draft`, `Sealed`, and `defaultBestOf` is **3**.
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
