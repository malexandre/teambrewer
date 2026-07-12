# Phase 02 — Card Database

**Goal** — Give TeamBrewer a rich, global-per-game **card reference database** and the **GameAdapter** seam
that isolates all game-specific knowledge. This phase finalizes the `GameAdapter` interface with the Flesh
and Blood adapter as its reference implementation, models `Game`/`Format`/`Hero`/`Card` global reference
data, imports the-fab-cube open dataset via an idempotent sync command + scheduled job, seeds FaB formats
and heroes, exposes a game-filtered card search endpoint, and ships the frontend card picker with
hover/press image preview. Cards are reference data only — decks remain links ([ADR-0002](../decisions/0002-decks-as-links.md)).

**Depends on** — [phase-01 Auth & Tenancy](phase-01-auth-and-tenancy.md) (a team is bound to a `gameId`;
card reads are filtered by the active team's game).

**Implements**
- Feature: [card-database](../features/card-database.md)
- ADRs: [ADR-0006 game-agnostic-core](../decisions/0006-game-agnostic-core.md) · [ADR-0007 external-data-approach](../decisions/0007-external-data-approach.md)
- Architecture: [game-abstraction](../architecture/game-abstraction.md) · [data-model](../architecture/data-model.md#game-reference-data-global-per-game--owned-by-adapter)
- Domain: [card-data-sources](../domain/card-data-sources.md) · [flesh-and-blood](../domain/flesh-and-blood.md)
- Skill: [working-with-card-data](../../.claude/skills/working-with-card-data/SKILL.md)

**Scope**
- **Finalize the `GameAdapter` interface** (indicative shape in [game-abstraction](../architecture/game-abstraction.md)):
  `key`, `displayName`, `identityLabel`, `listFormats()`, `fetchCardSource()`, `mapCard()`,
  `cardIdentity()`, optional `recognizeDeckUrl()`. Implement the **FaB adapter** fully as the reference.
- **Reference data models + migrations** (global, no `teamId`): `Game`, `Format`, `Hero`/identity, `Card`.
- **Card sync**: a command + a scheduled job that fetches the-fab-cube dataset, maps records through the FaB
  adapter, and **idempotently upserts** cards by `(gameId, externalId)`, storing a **data version/source**.
- **Seed** the `Game` catalog (FaB), FaB `Format`s, and FaB `Hero`s (from the adapter/dataset).
- **Search endpoint**: indexed card search filtered by the active team's `gameId`; for FaB, identity is
  **name + pitch** (a named card exists at multiple pitch values).
- **Frontend**: autocomplete card picker (name + pitch for FaB), hover/press card **image** preview anywhere a
  card is referenced (the image doubles as the detail — no separate detail view). PWA caching of card images.

**Deliverables**
- **Backend**
  - `apps/api/src/games/game-adapter.interface.ts` — the finalized `GameAdapter` contract + normalized
    `NormalizedCard` / `RawCardRecord` / `FormatDefinition` types.
  - `apps/api/src/games/flesh-and-blood/` — the FaB adapter: source fetch, `mapCard`, `cardIdentity`
    (name + pitch), format + hero definitions, optional Fabrary URL recognition (link recognition only; no
    content scraping).
  - `apps/api/src/games/game-adapter.registry.ts` — resolves an adapter by a team's `gameId` (core never
    imports a game adapter directly).
  - Prisma models + migration: `Game`, `Format`, `Hero`, **lean** `Card`, `CardDataVersion` (`Card` unique on
    `(gameId, externalId)`, searchable index on `(gameId, name)`). *(As built: the `Card` is lean — `name`,
    `pitch`, `imageUrl` only; provenance lives in `CardDataVersion`. No combat stats / `formatLegality` /
    printings — decks are links and the image conveys the rest.)*
  - `CardSyncService` + a CLI/Nest command (`pnpm --filter api card:sync`) and a scheduled job; idempotent
    upsert; records data version.
  - `CardsModule`: `GET /api/cards?query=&pitch=&limit=&cursor=` (keyset/cursor pagination, filtered by the
    active team's game), `GET /api/cards/:cardId`, `GET /api/card-data/version`, the instance-admin
    `POST /api/admin/card-data/sync`, and reference endpoints `GET /api/formats`, `GET /api/heroes`
    (game-filtered). Card/format/hero reads are **global reference data filtered by `gameId`** — not
    `teamId`-scoped, but only the active team's game is returned. *(No `formatId` filter — dropped with the
    lean model.)*
  - Seed script for the `Game` catalog + FaB formats. *(Heroes are derived by the sync, not seeded.)*
- **Shared** (`packages/shared`): Zod schemas for the normalized card, format, hero, and the search
  request/response.
- **Frontend** (`apps/web/src/features/cards`)
  - `CardPicker` autocomplete (debounced; shows name + pitch for FaB), `CardPreview` (image on hover on
    desktop, press on mobile — the image is the detail; no separate `CardDetail` view in the lean model),
    a `CardDataVersionBadge`. TanStack Query hooks (`useCardSearch`, `useCard`, `useFormats`, `useHeroes`,
    `useCardDataVersion`) with query keys that include the active `teamId` (so the correct game's data is fetched).

**Task checklist**
- [x] Read [card-database](../features/card-database.md), [game-abstraction](../architecture/game-abstraction.md), [ADR-0006](../decisions/0006-game-agnostic-core.md), [ADR-0007](../decisions/0007-external-data-approach.md), [card-data-sources](../domain/card-data-sources.md), [flesh-and-blood](../domain/flesh-and-blood.md), and the [working-with-card-data](../../.claude/skills/working-with-card-data/SKILL.md) skill.
- [x] Pull the-fab-cube schema docs (`documentation/json-schemas.md`) at build time; confirm the current field list and license/attribution terms before shipping. Do **not** rely on memory for fields.
- [x] Finalize the `GameAdapter` interface + normalized card/format/hero types; write unit tests for the contract using a small **fixture** dataset (no live network).
- [x] Implement the FaB adapter `mapCard` (raw → normalized) and `cardIdentity` (name + pitch); test-first against the fixture, asserting a card that exists at multiple pitch values maps to distinct identities.
- [x] Add Prisma models + migration for `Game`, `Format`, `Hero`, `Card` with the required unique/search indexes; add fixtures.
- [x] Implement `CardSyncService` + command: fetch (mockable), map via adapter, upsert by `(gameId, externalId)`, store `sourceVersion`. Write the **idempotency** test first (running sync twice over the same fixture yields no duplicates and stable rows).
- [x] Add the scheduled job wrapper around the sync service (schedule configurable; disabled in tests).
- [x] Write the seed script (FaB `Game`, formats); verify the seed is idempotent. *(Heroes are derived from
  the synced dataset — hero-type cards — not statically seeded; the seed is network-free.)*
- [x] Implement the search endpoint (indexed `name`; FaB name + pitch) filtered by the active team's `gameId`; cursor pagination. Write happy-path + validation + game-filter tests first (a team on game X never sees game Y cards).
- [x] Add `GET /api/cards/:cardId`, `GET /api/formats`, `GET /api/heroes` (game-filtered).
- [x] Build the frontend `CardPicker`, `CardPreview` + hooks; component tests for autocomplete and preview.
  *(Lean model: the image preview is the detail — no separate rich `CardDetail` view.)*
- [x] Update [README.md](README.md) status and [CLAUDE.md](../../CLAUDE.md) commands (add the `card:sync` command).

**Tests & verification**
- **Unit (Vitest):** FaB adapter `mapCard` maps fixture records correctly (all fields, legality flags);
  `cardIdentity` yields distinct identities for the same name at different pitch values; Zod card/format/hero
  schemas accept valid and reject malformed records.
- **Integration (Vitest + test DB):**
  - **Sync idempotency:** running the sync twice over the same fixture produces the same rows (no duplicates),
    upserting by `(gameId, externalId)`; `sourceVersion` is recorded.
  - **Search:** query by name returns expected cards, ordered/paginated; FaB search distinguishes pitch;
    results are **filtered to the active team's game** — a team on game A cannot retrieve game B's cards.
  - Reference endpoints return only the active team's game's formats/heroes.
- **Determinism:** all tests use fixtures — **no live network** to the-fab-cube or any external endpoint.
- **Component (Vitest + Testing Library):** `CardPicker` autocompletes and shows name + pitch; `CardPreview`
  renders the card image on hover/press.
- **Manual proof (run and observe):** run `pnpm --filter api card:sync` against the dataset (or a local
  fixture) → cards populate; open the web app on a FaB team → the card picker autocompletes real FaB cards,
  preview/detail render, and the UI shows the card-data version/source. Confirm `pnpm test` passes locally (CI runs on push once a remote is configured).

**Out of scope**
- Deck entities and deck-URL storage (phase-03; the FaB adapter's `recognizeDeckUrl` is provided here but
  **consumed** by decks in phase-03 — no scraping of deck contents ever, per [ADR-0002](../decisions/0002-decks-as-links.md)/[ADR-0007](../decisions/0007-external-data-approach.md)).
- The Riftbound adapter and Riftcodex sync (phase-12) — this phase only proves the seam generalizes.
- Card references inside suggestions/game-plans/primers (their owning phases consume the `CardPicker`).
- Automated external meta/decklist feeds — out of scope by [ADR-0007](../decisions/0007-external-data-approach.md).

**See also**
- [card-database](../features/card-database.md) · [game-abstraction](../architecture/game-abstraction.md) · [data-model](../architecture/data-model.md)
- [card-data-sources](../domain/card-data-sources.md) · [flesh-and-blood](../domain/flesh-and-blood.md)
- [ADR-0006](../decisions/0006-game-agnostic-core.md) · [ADR-0007](../decisions/0007-external-data-approach.md)
- Skills: [working-with-card-data](../../.claude/skills/working-with-card-data/SKILL.md) · [adding-a-feature-module](../../.claude/skills/adding-a-feature-module/SKILL.md) · [implementing-a-phase](../../.claude/skills/implementing-a-phase/SKILL.md)
- Prev: [phase-01 Auth & Tenancy](phase-01-auth-and-tenancy.md) · Next: [phase-03 Decks](phase-03-decks.md) · Related: [phase-12 Riftbound Adapter](phase-12-riftbound-adapter.md)
