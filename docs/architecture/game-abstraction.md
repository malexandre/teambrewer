# Game Abstraction (Adapters)

TeamBrewer's core is **game-agnostic**; each supported TCG plugs in via a **Game Adapter**. Flesh and
Blood is implemented first; Riftbound is a later adapter. A team is bound to exactly one game (see
[ADR-0006 game-agnostic-core](../decisions/0006-game-agnostic-core.md) and
[ADR-0008 multi-tenant-teams](../decisions/0008-multi-tenant-teams.md)).

## Why

The core features (decks, events, games, matchups, suggestions, collaboration) are the same regardless of
TCG. Only a bounded set of things are game-specific: **identity** (FaB "hero" / Riftbound "Legend"),
**formats**, **card schema/fields**, **card data source**, and some **display labels**. Isolating these
behind an interface keeps the core clean and makes adding a game a contained job.

## What is game-specific (behind the adapter) vs generic (core)

| Game-specific (adapter) | Generic (core) |
|---|---|
| Identity concept & label ("Hero" vs "Legend") | Deck as `{ identity, format, link, metadata }` |
| Format list & metadata (CC, Blitz… vs Riftbound formats) | Event / gauntlet / expected-metagame structure |
| Default best-of a new game log pre-selects (FaB Bo1 vs Riftbound Bo3) | Game logging + confidence model |
| Card schema mapping (pitch, cost… vs might, domain…) | Game logging + confidence model |
| Card data source + sync mapping | Matchup aggregation math |
| Identity/faction/affinity constraints (display only) | Testing queue, game-plans, collaboration, knowledge |
| Deck-link providers recognized (e.g. Fabrary URL) | Multi-tenancy, auth, dashboard |

## The adapter contract (conceptual)

Define a `GameAdapter` interface (finalized when first implemented in phase-02/03). Indicatively:

```ts
interface GameAdapter {
  key: 'flesh_and_blood' | 'riftbound'
  displayName: string
  identityLabel: string            // "Hero" | "Legend"
  defaultBestOf: BestOf             // the best-of a new game log pre-selects (FaB: 1, Riftbound: 3)

  listFormats(): FormatDefinition[] // core stores these as Format rows per game

  // Card data sync
  fetchCardSource(): Promise<RawCardRecord[]>
  mapCard(raw: RawCardRecord): NormalizedCard   // → core Card fields
  cardIdentity(card: NormalizedCard): string    // FaB: name + pitch

  // Deck link recognition (best-effort, ToS-safe; no scraping of contents)
  recognizeDeckUrl?(url: string): { provider: string; externalId?: string } | null

  // Display/formatting helpers as needed
}
```

- **Core never imports game-specific code directly.** It resolves the adapter by the team's `gameId`.
- **Reference data** (Game, Format, Hero/identity, Card) is populated per game via the adapter and stored
  globally; teams read only their game's reference data.
- Adapters live in the backend (e.g. `apps/api/src/games/flesh-and-blood/`, `.../riftbound/`) and expose
  any needed labels to the frontend via config/endpoints so the UI shows correct terms.
- **`GET /api/game-config`** (team-scoped via `TeamContextGuard`) is the seam that exposes adapter-derived
  config to the web: it resolves the adapter from the verified team's `gameId` and returns
  `{ gameId, identityLabel, defaultBestOf }` (shared `gameConfigSchema` in `packages/shared`). Game logging's
  wizard uses it to pre-select `bestOf`; this is also where the hardcoded "Hero"/"Format" labels will
  eventually be replaced by `identityLabel`, once that wiring is done (not yet — see
  [`game-logging.md`](../features/game-logging.md)).

## Guardrails

- Do **not** hard-code FaB formats, the word "hero", or pitch semantics in shared/core code — route them
  through the adapter/reference data.
- Keep the FaB adapter as the reference implementation; when building Riftbound (phase-12), the only new
  work should be a new adapter + its reference data, not core changes. If core changes are needed, that's
  a signal the abstraction leaked — fix the boundary.

See [`../domain/flesh-and-blood.md`](../domain/flesh-and-blood.md),
[`../domain/riftbound.md`](../domain/riftbound.md), and
[`../domain/card-data-sources.md`](../domain/card-data-sources.md).
