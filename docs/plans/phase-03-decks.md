# Phase 03 — Decks

**Goal** — Deliver the first team-owned domain feature: **decks as links** ([ADR-0002](../decisions/0002-decks-as-links.md)).
A deck is a link + structured metadata (hero/identity, format, source, status, visibility, tags, notes) and
a manual iteration log — never a stored card list, never a deck builder. This phase builds the `Deck` and
`DeckIterationEntry` models, team-scoped CRUD with ownership + team-admin moderation, best-effort deck-URL
recognition (no content scraping), and a mobile-first deck list/detail/create-edit UI with status +
visibility controls, an iteration log, and hero/format pickers drawn from the phase-02 reference data. It is
the first real exercise of the phase-01 tenancy backbone and the phase-02 card/reference data.

**Depends on** — [phase-01 Auth & Tenancy](phase-01-auth-and-tenancy.md), [phase-02 Card Database](phase-02-card-database.md).

**Implements**
- Feature: [decks](../features/decks.md)
- ADRs: [ADR-0002 decks-as-links](../decisions/0002-decks-as-links.md) · [ADR-0007 external-data-approach](../decisions/0007-external-data-approach.md)
- Architecture: [data-model](../architecture/data-model.md#decks-link-only--see-adr-0002) · [multi-tenancy](../architecture/multi-tenancy.md) · [game-abstraction](../architecture/game-abstraction.md) · [frontend](../architecture/frontend.md)
- Domain: [flesh-and-blood](../domain/flesh-and-blood.md)

**Scope**
- **`Deck` model** (link-only, per [data-model](../architecture/data-model.md#decks-link-only--see-adr-0002)):
  `{ teamId, name, gameId, formatId, heroId?, externalUrl, source, ownerId, status, visibility,
  isReference, tags[], notes, archivedAt? }` where `status` ∈ `exploratory | testing | tournament_ready |
  retired`, `visibility` ∈ `team | private`, and `isReference` distinguishes gauntlet/opponent archetypes
  from the team's own decks.
- **`DeckIterationEntry` model**: `{ deckId, authorId, body, createdAt }` — a manual prose changelog; **no
  stored card list**, no computed diffs ([ADR-0002](../decisions/0002-decks-as-links.md)).
- **Team-scoped CRUD** with **ownership** (a member manages their own decks) + **team-admin moderation**
  (admins may edit/archive any deck in their team). All queries filtered by the verified `teamId`; `gameId`
  bound to the team's game; `formatId`/`heroId` validated against that game's reference data.
- **Status lifecycle** transitions and **visibility** rules (private drafts visible only to the owner and
  team-admins; team decks visible to all team members).
- **Best-effort deck-URL recognition** via the game adapter's `recognizeDeckUrl` (e.g. Fabrary) — records
  provider/label metadata only; **never fetches or scrapes deck contents** ([ADR-0007](../decisions/0007-external-data-approach.md)).
- **Frontend**: mobile-first deck list (filter by format/status/hero/owner), deck detail (link out, metadata,
  iteration log), create/edit form with status + visibility controls and hero/format pickers from reference
  data; the phase-02 `CardPicker`/`CardPreview` are available for card references in notes where useful.

**Deliverables**
- **Backend** (`apps/api/src/decks/`)
  - Prisma models + migration: `Deck`, `DeckIterationEntry` with composite `(teamId, ...)` indexes; soft-delete
    via `archivedAt`.
  - `DecksModule` (controller + service + team-scoped repository + DTOs) using the phase-01 team-scoped
    data-access helper.
  - Endpoints (per [api-conventions](../architecture/api-conventions.md), `X-Team-Id` header):
    `GET /api/decks` (filter/sort/paginate), `POST /api/decks`, `GET /api/decks/:deckId`,
    `PATCH /api/decks/:deckId`, `DELETE /api/decks/:deckId` (archive), `PATCH /api/decks/:deckId/status`,
    `GET /api/decks/:deckId/iterations`, `POST /api/decks/:deckId/iterations`.
  - `POST /api/decks/recognize-url` (or inline on create) using the adapter's `recognizeDeckUrl` — metadata only.
  - Ownership + role authorization; status-transition validation; visibility enforcement.
- **Shared** (`packages/shared`): Zod schemas for deck create/update, status change, iteration entry, deck
  list query/response, and the `DeckStatus` / `DeckVisibility` enums.
- **Frontend** (`apps/web/src/features/decks`): `DeckList`, `DeckDetail`, `DeckForm` (create/edit),
  `DeckStatusControl`, `DeckVisibilityControl`, `IterationLog`, hero/format pickers, and TanStack Query hooks
  (`useDecks`, `useDeck`, `useCreateDeck`, `useUpdateDeck`, `useDeckIterations`) with team-scoped query keys.

**Task checklist**
- [ ] Read [decks](../features/decks.md), [ADR-0002](../decisions/0002-decks-as-links.md), [ADR-0007](../decisions/0007-external-data-approach.md), [data-model](../architecture/data-model.md#decks-link-only--see-adr-0002), [multi-tenancy](../architecture/multi-tenancy.md).
- [ ] Write Zod schemas + enums in `packages/shared` (deck create/update, status change, iteration, list query) — test-first.
- [ ] Add Prisma models + migration for `Deck` and `DeckIterationEntry`; add deck factories to the two-team test harness.
- [ ] Implement `DecksModule` via the team-scoped data-access helper. **Write the tenant-isolation test first** (a member of team A cannot read/update/archive a deck in team B; forged `X-Team-Id`/`deckId` → 404).
- [ ] Implement CRUD with ownership + team-admin moderation (member edits own; admin moderates any in-team; member cannot edit another member's deck → 403). Tests first.
- [ ] Implement the status lifecycle with validated transitions (`exploratory → testing → tournament_ready → retired`, with allowed/blocked moves defined in [decks](../features/decks.md)); table-driven transition tests first.
- [ ] Implement visibility rules (private draft visible only to owner + team-admins; team decks to all members); tests first, including a private-draft-not-visible-to-another-member test.
- [ ] Validate `gameId` = team's game and `formatId`/`heroId` belong to that game's reference data (cross-game FK rejected). Test first.
- [ ] Implement best-effort `recognize-url` via the FaB adapter (metadata only, no content fetch); test with fixture URLs (recognized Fabrary URL → provider label; unrecognized → null; **no network call**).
- [ ] Build the frontend deck list/detail/form (mobile-first), status + visibility controls, iteration log, hero/format pickers; component tests for the form and status control.
- [ ] Update [README.md](README.md) status.

**Tests & verification**
- **Unit (Vitest):** deck Zod schemas (valid/invalid, e.g. bad `externalUrl`); status-transition validator
  (table-driven: each allowed transition passes, each disallowed → 422); deck-URL recognizer against fixture URLs.
- **Integration (Vitest + test DB):**
  - CRUD happy paths scoped to the team; create stamps `teamId` from context (never the body) and `gameId`
    from the team; `formatId`/`heroId` cross-game FK rejected.
  - **Status transitions** enforced end to end; iteration entries append-only and attributed to the author.
  - **Ownership/moderation:** member edits own deck; member editing another's → 403; team-admin moderates any in-team deck.
  - **Visibility:** a private draft is not returned to another member; is returned to its owner and to team-admins.
- **Tenant-isolation (mandatory):** a user in team A cannot read/update/archive team B's decks; forged
  `X-Team-Id` or cross-team `deckId` → 404; listing never returns another team's decks.
- **Component (Vitest + Testing Library):** deck form validates required fields and picks hero/format from
  reference data; status control only offers valid transitions.
- **E2E (Playwright):** create a deck (link + hero + format) → set status → add an iteration entry → confirm
  it appears in detail; switch teams and confirm the deck is not visible in the other team.
- **Manual proof:** create/edit/archive decks in the running app on a FaB team; paste a Fabrary URL and see
  it recognized (metadata only); confirm `pnpm test` (incl. isolation) and `pnpm test:e2e` pass and CI is green.

**Out of scope**
- Any stored card list, deck import/parse, legality validation, or version diffs — permanently out by
  [ADR-0002](../decisions/0002-decks-as-links.md) (the linked tool owns the list).
- Comments / activity / mentions on decks — added by [phase-04 Collaboration Core](phase-04-collaboration-core.md),
  which retrofits decks as its first consumer.
- Events/gauntlets that reference `isReference` decks (phase-05), game logging (phase-06), card-test
  suggestions and test assignments (phase-08), matchup game-plans (phase-09).

**See also**
- [decks](../features/decks.md) · [ADR-0002](../decisions/0002-decks-as-links.md) · [ADR-0007](../decisions/0007-external-data-approach.md)
- [data-model](../architecture/data-model.md) · [multi-tenancy](../architecture/multi-tenancy.md) · [frontend](../architecture/frontend.md)
- Skills: [adding-a-feature-module](../../.claude/skills/adding-a-feature-module/SKILL.md) · [implementing-a-phase](../../.claude/skills/implementing-a-phase/SKILL.md)
- Prev: [phase-02 Card Database](phase-02-card-database.md) · Next: [phase-04 Collaboration Core](phase-04-collaboration-core.md)
