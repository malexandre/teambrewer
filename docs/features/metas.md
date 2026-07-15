# Feature: Metas

## Summary

The **Meta** is TeamBrewer's central organizing concept
([ADR-0010](../decisions/0010-meta-as-organizing-hub.md), superseding the event-centric ADR-0004): a
lightweight, team-scoped **metagame window** (a name + a `[startDate, endDate]` span + a description) that
owns a **tiered opponent-deck list** — the field to beat. It replaces the per-event gauntlet with a durable
picture of the metagame that persists across every event in the window. Decks link to metas (a deck can
belong to many), game logs optionally carry a `metaId`, and per-deck matchup **readiness** is measured
against the current meta's deck list (see [confidence-and-matchups.md](confidence-and-matchups.md)).

## Goals & value

- Define the field to beat **once per metagame window**, reused across events, instead of re-entering a
  gauntlet per tournament.
- Replace the fiddly `expectedMetaShare %` with a coarse, honest **tier** (how central an archetype is).
- Anchor per-deck readiness and testing priorities to a single "current meta".

## User stories

- As a **member**, I create a meta ("Nationals season", 2026-07-01 → 2026-09-30) so the team has a shared
  picture of the field.
- As a **member**, I add tiered opponent decks (meta-defining: Fai; contender: Oldhim; fringe: Dromai) so we
  know what matters most.
- As a **member**, I open the current meta to see the field grouped by tier before choosing what to test.

## Data

Uses these entities from [data-model.md](../architecture/data-model.md). Every row is team-scoped with a
non-null `teamId` (except the `DeckMeta` join, scoped through its parents).

- **Meta** `{ id, teamId, name, startDate, endDate, description, changeReason?, changeReasonHeroId?,
  changeReasonImageUrl?, archivedAt? }`
  - **Current meta** = the meta whose `[startDate, endDate]` contains today; on overlap, the one with the
    latest `startDate`. Resolved server-side (no stored "is current" flag).
  - `endDate` must be on or after `startDate`.
  - **Change reason (optional imagery)** — a deliberately **FAB-flavored** signal of *why* the meta exists,
    used to give each meta a meaningful image on the list card instead of the neutral icon:
    `changeReason ∈ ban_list | living_legend | product_release`. `living_legend` carries a
    `changeReasonHeroId` (the retiring hero, whose art is shown, resolved client-side like the meta board's
    hero squares); `product_release` carries a user-pasted `changeReasonImageUrl` (an http(s) marketing-image
    URL — we **only link to it**, never fetch or host it, per the no-scraping data-source rule); `ban_list`
    needs neither (a built-in ban glyph). All three fields are nullable; only the field matching the reason
    is stored (the API normalizes the rest away), and a meta with no reason keeps the neutral Target icon.
    This is a FAB-specific extension kept optional so other games simply leave it unset — see
    [game-abstraction.md](../architecture/game-abstraction.md).
- **MetaDeckEntry** `{ id, metaId, teamId, tier, label, heroId?, opponentSnapshotLabel, notes }` — one
  tiered entry in a meta's deck list (the reshaped gauntlet), modelled as a **matchup subject**: a
  **required free-text `label`** (the human archetype name) plus an **optional `heroId`** qualifier.
  - The same hero may appear under multiple labels; only an **exact duplicate** — same hero + same `label`
    (case-insensitive), or the same `label` when hero-less — is rejected.
  - `tier` ∈ `meta_defining | contender | counter_meta | fringe` (labels: "Meta-defining" / "Contender" /
    "Counter-meta" / "Fringe — know it exists").
  - `opponentSnapshotLabel` is a server-derived human label derived from `label` at write time that survives
    deletion of the referenced hero.
- **DeckMeta** `{ id, deckId, metaId }` — explicit deck↔meta join (`@@unique(deckId, metaId)`); no `teamId`
  (reached through its parents). Deck-create defaults to linking the current meta.

## Behavior & rules

- **Shared team board** (the events precedent): any member creates/edits/deletes any meta or meta deck
  entry; there is no per-row owner.
- A meta deck entry is **fully editable** — `tier`, `label`, `heroId`, and `notes` may all be changed in
  place.
- Cross-game / cross-team foreign keys are rejected (a hero, when set — as a deck-entry qualifier or a
  `living_legend` change-reason hero — must belong to the team's game; a cross-game hero is a `422`).
  Cross-tenant reads return `404`.
- A meta's **change reason is normalized to its detail**: changing the reason (or clearing it) clears the
  non-matching detail server-side, so a `ban_list` meta never keeps a stale hero or image URL. The shared
  schema also rejects a detail field that contradicts the reason (a hero without `living_legend`, an image
  URL without `product_release`) as a `400`.
- `DELETE` on a meta archives it (`archivedAt`); archived metas are excluded from default lists.

## API surface

Indicative REST per [api-conventions.md](../architecture/api-conventions.md); `teamId` always comes from the
verified team context, never the body. (Endpoints land in WS-2 — `MetasModule`.)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/metas` | List metas (cursor paginated; archived excluded) |
| `POST` | `/api/metas` | Create a meta |
| `GET` | `/api/metas/current` | Resolve the current meta |
| `GET` | `/api/metas/:metaId` | Meta detail |
| `PATCH` | `/api/metas/:metaId` | Update fields |
| `DELETE` | `/api/metas/:metaId` | Archive (soft-delete) |
| `GET` | `/api/metas/:metaId/deck-entries` | List the tiered deck list |
| `POST` | `/api/metas/:metaId/deck-entries` | Add a deck entry |
| `PATCH` | `/api/metas/:metaId/deck-entries/:entryId` | Update tier/label/hero/notes |
| `DELETE` | `/api/metas/:metaId/deck-entries/:entryId` | Remove an entry |

Request/response bodies validate against the Zod schemas in `packages/shared` (`metas.ts`,
`meta-deck-entries.ts`).

## Tenancy & permissions

All meta and meta-deck-entry rows carry `teamId` and are filtered server-side by the verified active team
(`meta`, `metaDeckEntry` in `TEAM_OWNED_MODELS`); `DeckMeta` is scoped through its parents. A referenced
hero must belong to the same team/game. See [multi-tenancy.md](../architecture/multi-tenancy.md).

## Testing notes

- **Tenant isolation:** a user in team A cannot read/write team B's metas or deck entries even with a forged
  `teamId` (`404`/`403`); a deck entry cannot reference another team's hero.
- **Validation:** `endDate` before `startDate` rejected; a deck entry with a missing `label`, or an exact
  duplicate (same hero + `label`, case-insensitive; or same `label` when hero-less), rejected; an unknown
  `tier` rejected.
- **Current-meta resolution:** with overlapping windows, the latest `startDate` wins; with none containing
  today, "current" is empty.

## See also

- [ADR-0010 meta as the organizing hub](../decisions/0010-meta-as-organizing-hub.md)
- [tasks.md](tasks.md) · [decks.md](decks.md) · [confidence-and-matchups.md](confidence-and-matchups.md) ·
  [events-and-gauntlets.md](events-and-gauntlets.md) (superseded)
- [data-model.md](../architecture/data-model.md) · [multi-tenancy.md](../architecture/multi-tenancy.md)
