# Data Model

The conceptual data model for TeamBrewer. This is the shared reference for every feature spec and phase
plan. It is **conceptual, not a final Prisma schema** — field lists are indicative; the authoritative
schema evolves in the Prisma files as phases land, but it must stay consistent with the rules here.

Related: [multi-tenancy](multi-tenancy.md) · [game-abstraction](game-abstraction.md) ·
[ADR-0002 decks-as-links](../decisions/0002-decks-as-links.md) ·
[ADR-0005 confidence-weight-model](../decisions/0005-confidence-weight-model.md) ·
[ADR-0008 multi-tenant-teams](../decisions/0008-multi-tenant-teams.md).

## Golden rules

1. **Every team-owned row has a non-null `teamId`.** Global reference data (users, cards, games catalog)
   does not. See the table below for which is which.
2. **IDs** are opaque strings (CUID/UUID). **Timestamps** `createdAt` / `updatedAt` on every table.
3. **Soft-delete** (`archivedAt`) domain content rather than hard-deleting, so history/aggregates survive.
4. **Names are explicit** — `confidenceWeight`, not `cw`.
5. **Enums live where they belong:** cross-game enums in `packages/shared`; game-specific value sets
   (formats, identity/hero lists) come from the **game adapter**, not hard-coded in core.

## Global vs team-scoped

| Global (no `teamId`) | Team-scoped (has `teamId`) |
|---|---|
| `User`, `Session` | `Team`, `TeamMembership` (link tables — see note) |
| `Game` (the TCG catalog: FaB, Riftbound) | `Deck`, `Event`, `GauntletEntry` |
| `Card` (reference data, per game) | `GameLog`, `MatchupGamePlan`, `DeckSelection`, `Retrospective` |
| `Hero`/identity (reference data, per game) | `CardTestSuggestion`, `SuggestionVote`, `TestAssignment` |
| `Format` (reference data, per game) | `Comment`, `Mention`, `Notification`, `ActivityEvent` |
| | `Primer`, `Decision`, `Poll`, `PollVote` |

> Note: `Team` itself is the tenant root; `TeamMembership` carries `teamId` + `userId`. Users are global
> (one login, many teams).

## Entities (conceptual)

### Identity & tenancy
- **User** `{ id, name, displayName, isInstanceAdmin, authMethod: 'password_totp' | 'discord',
  passwordHash? (password accounts, via Better Auth), totpEnabled?, discordUserId?, discordUsername?, ... }`
  — each account uses exactly one login method; a `password_totp` user MAY also set `discordUserId` for
  **identity only** (not login). See [ADR-0009](../decisions/0009-discord-authentication.md).
- **Team** `{ id, name, slug, gameId (→ Game), createdBy, ... }` — bound to exactly one game.
- **TeamMembership** `{ id, teamId, userId, role: 'team_admin' | 'member', joinedAt }`
- **Session** — managed by Better Auth; carries the authenticated user; **active team** is resolved
  per-request (see [multi-tenancy](multi-tenancy.md)).
- **InviteLink / SetupToken** `{ id, userId?, teamId?, tokenHash, purpose: 'setup' | 'reset' | 'discord_link', expiresAt, usedAt }`
  — single-use, hashed at rest. `discord_link` binds a provisioned account to a Discord identity on first
  authorization (preserves invite-only). See [security](security.md), [ADR-0009](../decisions/0009-discord-authentication.md).

### Game reference data (global, per game — owned by adapter)
- **Game** `{ id (stable slug, e.g. "flesh-and-blood"), key: 'flesh_and_blood' | 'riftbound', name }`
  — `Team.gameId` holds the slug `id`; `key` is the adapter/enum key.
- **Format** `{ id, gameId, key, name, isConstructed, sortOrder }` (e.g. CC, Blitz, LL, SAGE)
- **Hero** (a.k.a. identity) `{ id, gameId, externalId, name, classes[], talents[], startingLife?, imageUrl?, archivedAt? }`
  — derived from the synced card dataset (hero-type cards).
- **Card (lean)** `{ id, gameId, externalId (stable source id), name, pitch?, imageUrl?, archivedAt? }`
  — FaB card identity is effectively **name + pitch**; the adapter maps source → this. **Cards are reference
  data only** (decks are links, [ADR-0002](../decisions/0002-decks-as-links.md)); the matchup/confidence math
  never reads card stats and the card **image** already conveys cost/power/text visually, so the model
  intentionally stores no combat stats, format legality, or printings — just enough to reference a card via
  search/autocomplete and show its image. Card-data provenance lives in **CardDataVersion**
  `{ gameId, sourceName, sourceUrl, sourceVersion, lastSyncedAt, cardCount }` (one row per game), which drives
  the "card data as of …" indicator. *(Decided in phase-02; a richer card model can be reintroduced by a
  future phase + ADR if a feature needs structured stats.)*

### Decks (link-only — see ADR-0002)
- **Deck** `{ id, teamId, name, gameId, formatId, heroId?, externalUrl, source, ownerId,
  status: 'exploratory' | 'testing' | 'tournament_ready' | 'retired', visibility: 'team' | 'private',
  tags[], notes, archivedAt? }`
- **DeckIterationEntry** `{ id, deckId, authorId, body (e.g. "-2 X, +2 Y after event"), createdAt }`
  — manual changelog; there is **no stored card list**.

### Events & gauntlets
- **Event** `{ id, teamId, name, formatId, date, location?, importance, description, status }`
- **GauntletEntry** `{ id, eventId, teamId, referenceDeckId (→ Deck) or heroId/archetypeLabel,
  expectedMetaShare (0–100), notes }`
- **Attendance** `{ id, eventId, userId, status: 'going' | 'maybe' | 'not_going' }`
- **DeckSelection** `{ id, eventId, userId, deckId, locked, lockedAt?, reasoning }` — one per
  `(event, user)`; carries **no `teamId`** (scoped transitively through its parent event, like
  `Attendance`). Team-admin-only lock/unlock; a locked selection rejects a member edit (`422`).
- **Retrospective** `{ id, eventId, teamId, authorId, body, resultsSummary, learnings, archivedAt? }` —
  **one per event** (unique `eventId`; a second create → `409`).

### Game logging & matchups
- **GameLog** `{ id, teamId, loggedById, formatId, eventId?, playedAt,
  sideA (self): { pilotUserId?, deckId | selfMetaDeckEntryId | (selfHeroId + selfArchetypeLabel) },
  sideB (opponent): { opponentPilotUserId? | externalOpponentName?, opponentDeckId | opponentMetaDeckEntryId | (opponentHeroId + opponentArchetypeLabel) },
  firstPlayerSide (which side took the first turn: 'A' | 'B'), bestOf, result (games won A / B or single-game win/loss/draw),
  winType?, lossReason?, learnings,
  confidenceFactors: { skillParity, seriousness, deckMaturity, pilotFamiliarity } (each an enum),
  confidenceWeight (0–1, derived) }`
  — see [ADR-0005](../decisions/0005-confidence-weight-model.md) for the factor→weight formula.
- **GameLogCard** `{ id, gameLogId, cardId, role: 'impressive' | 'underperforming', side: 'ours' | 'theirs' }`
  — an optional card reference captured on a `GameLog` (which cards over- or under-performed, tagged by
  side). Scoped **transitively through its parent `GameLog`** — like `Attendance` on `Event`, it carries no
  `teamId` of its own; `cardId` must belong to the team's game.
- **Matchup** — *derived/aggregated*, not necessarily a stored table: for a `(deckA/heroA vs deckB/heroB,
  format, [event])` pairing, compute weighted win rate `Σ(wᵢ·winᵢ)/Σ(wᵢ)`, raw N, effective sample
  `Σ(wᵢ)`, trust indicator. May be materialized for performance later; source of truth is `GameLog`.

### Testing queue
- **CardTestSuggestion** `{ id, teamId, deckId, authorId, cardInId (→ Card), cardOutId? (→ Card),
  reasoning, status: 'proposed' | 'testing' | 'adopted' | 'rejected', resolutionNote }`
- **SuggestionVote** `{ id, suggestionId, userId }` — **upvote-only** (phase-08, with the user): one row per
  `(suggestionId, userId)` and the row's existence is the upvote, so there is no `value`. No `teamId` — it
  is scoped transitively through its parent suggestion (like `Attendance`/`GameLogCard`).
- **TestAssignment** `{ id, teamId, eventId?, assigneeId, assignedById, deckId (ours),
  opponentRef (gauntletEntryId | heroId | archetypeLabel), opponentSnapshotLabel, targetGames?,
  status: 'open' | 'in_progress' | 'done' | 'cancelled', notes }` — `opponentSnapshotLabel` (phase-08, with
  the user) is a server-derived human label resolved at write time so a later-deleted gauntlet entry/hero
  still reads meaningfully.

### Game-plans
- **MatchupGamePlan** `{ id, teamId, ourDeckId, opponentArchetypeLabel, opponentHeroId?,
  opponentRef (derived), formatId, body, updatedBy, archivedAt? }` — one canonical plan per
  `(teamId, ourDeckId, opponentRef, formatId)`. The opponent is a **matchup subject** mirroring
  `MetaDeckEntry`: a **required `opponentArchetypeLabel`** with an **optional `opponentHeroId`** qualifier.
  **Implementation note:** `opponentRef` is a derived, normalized key string
  (`hero:<id>|label:<lowercased>` when hero-qualified, else `label:<lowercased>`) — produced by the shared
  `deriveMatchupSubjectRef` (single source of truth) — so the uniqueness constraint holds across the
  polymorphic target (Postgres treats NULLs as distinct); a derived `opponentSnapshotLabel` survives
  deletion of the referenced hero. A duplicate create → `409`;
  editing updates in place and re-stamps `updatedBy`. Shared team knowledge (no owner): any member
  creates/edits; **archive is team-admin only**. **Key cards (meta-pivot redesign, WS-4):** the structured
  `MatchupGamePlanCard` child table was dropped — key cards now live inline in `body` as `+[[cardId]]`
  tokens (the shared `+card` mention model; see `packages/shared/src/card-tokens.ts`), resolved to card
  chips at render time. A collaboration subject (`subjectType: 'matchup_game_plan'`).
- **GamePlanMetaDeckEntry** `{ id, gamePlanId, metaDeckEntryId }` — join attaching a `MatchupGamePlan` to
  specific meta deck entries; create/update on a game-plan accept `metaDeckEntryIds`. Scoped transitively
  through its parents (no `teamId` of its own).

### Collaboration (polymorphic — see collaboration-core spec)
- **Comment** `{ id, teamId, authorId, subjectType, subjectId, body, parentCommentId?, archivedAt? }`
- **Mention** `{ id, commentId, mentionedUserId }`
- **Notification** `{ id, teamId, userId, type, subjectType, subjectId, readAt? }`
- **ActivityEvent** `{ id, teamId, actorId, verb, subjectType, subjectId, createdAt }`

### Team knowledge
- **Primer** `{ id, teamId, authorId, title, kind: 'deck_primer' | 'matchup' | 'format_notes' | 'other',
  relatedDeckId?, body (markdown), visibility, archivedAt? }`
- **Decision** `{ id, teamId, authorId, title, context, decision, rationale, relatedSubjectRef?, decidedAt }`
- **Poll** `{ id, teamId, authorId, question, options[], closesAt?, status }`
- **PollVote** `{ id, pollId, userId, optionId }`

## ERD (conceptual)

```mermaid
erDiagram
  USER ||--o{ TEAM_MEMBERSHIP : has
  TEAM ||--o{ TEAM_MEMBERSHIP : has
  GAME ||--o{ TEAM : "played by"
  GAME ||--o{ CARD : defines
  GAME ||--o{ HERO : defines
  GAME ||--o{ FORMAT : defines

  TEAM ||--o{ DECK : owns
  DECK ||--o{ DECK_ITERATION_ENTRY : logs
  HERO ||--o{ DECK : "identity of"
  FORMAT ||--o{ DECK : "format of"

  TEAM ||--o{ EVENT : owns
  EVENT ||--o{ GAUNTLET_ENTRY : has
  EVENT ||--o{ ATTENDANCE : has
  EVENT ||--o{ DECK_SELECTION : has
  EVENT ||--o{ RETROSPECTIVE : has

  TEAM ||--o{ GAME_LOG : owns
  DECK ||--o{ GAME_LOG : "side A/B"
  EVENT ||--o{ GAME_LOG : "context"

  TEAM ||--o{ CARD_TEST_SUGGESTION : owns
  DECK ||--o{ CARD_TEST_SUGGESTION : "for deck"
  CARD ||--o{ CARD_TEST_SUGGESTION : "in/out"
  CARD_TEST_SUGGESTION ||--o{ SUGGESTION_VOTE : has
  TEAM ||--o{ TEST_ASSIGNMENT : owns

  TEAM ||--o{ MATCHUP_GAME_PLAN : owns
  TEAM ||--o{ COMMENT : owns
  COMMENT ||--o{ MENTION : has
  TEAM ||--o{ NOTIFICATION : owns
  TEAM ||--o{ ACTIVITY_EVENT : owns
  TEAM ||--o{ PRIMER : owns
  TEAM ||--o{ DECISION : owns
  TEAM ||--o{ POLL : owns
  POLL ||--o{ POLL_VOTE : has
```

## Indexing & integrity notes
- Composite indexes on `(teamId, ...)` for all team-scoped queries.
- `TeamMembership` unique on `(teamId, userId)`.
- `Card` unique on `(gameId, externalId)`; searchable index on `(gameId, name)`.
- Foreign keys must respect tenancy: a `GameLog.deckId` must belong to the same `teamId` — enforce in the
  service layer and cover with isolation tests (see [testing-strategy](testing-strategy.md)).
