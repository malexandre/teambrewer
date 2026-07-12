# Game Logging v2 — Wizard, game-driven defaults, and card capture

- **Date:** 2026-07-12
- **Status:** Implemented (2026-07-12)
- **Type:** Additive follow-up to phase-06 (game logging), built on its own feature branch.
- **Builds on:** [phase-06-game-logging](../../plans/phase-06-game-logging.md),
  [ADR-0005](../../decisions/0005-confidence-weight-model.md),
  [ADR-0002](../../decisions/0002-decks-as-links.md),
  [game-abstraction](../../architecture/game-abstraction.md).

## Context

Phase-06 shipped the game log and its confidence-weight model with a single-screen mobile form. In use,
the form is long for a phone, so we restructure it into a short **wizard**. Two related improvements ride
along: the best-of default should be **game-specific** (Bo1 suits Flesh and Blood; Bo3 suits Riftbound),
which belongs behind the game adapter; and the team wants to capture **which cards over- or
under-performed** in a game, feeding future matchup insight. "Cards to look out for when facing archetype
X" is deliberately **out of scope** here — that is durable matchup knowledge owned by phase-09's
`MatchupGamePlan` (`keyCards[]` + body), not a per-game observation. "Try card X" tech ideas remain
phase-08's `CardTestSuggestion`.

The confidence-weight model (ADR-0005) is unchanged.

## Goals

1. Turn the logging form into a 3-step fast-path **wizard** (with an optional 4th step), consistent across
   viewports.
2. Make the pre-selected `bestOf` **game-driven** via the `GameAdapter`, exposed to the web through a small
   game-config endpoint.
3. Capture optional **impressive / underperforming cards** per game, each tagged by side (ours / theirs).

## Non-goals

- No change to the confidence-weight formula or factors.
- No "cards to look out for vs X" here (phase-09 game-plans).
- No per-card matchup aggregation UI (phase-07 may consume the new data later).
- Not replacing the hardcoded "Hero"/"Format" labels yet — the new endpoint is the seam that enables it
  later, but wiring the labels is out of scope.

## UX — the wizard

A `GameLogWizard` component owns all form state; each step is a small, independently-testable child that
receives state + setters. A header shows a **"Step N of 3"** indicator with **Back**/**Next**; **Next**
runs that step's validation before advancing. The indicator counts only the **three core steps** — step 4
is an optional appendix reached from step 3, not part of the numbered progression (so a fast log always
reads "of 3"). Used on all viewports (mobile-first; desktop just renders the same steps centered and
roomier). Edit mode reuses the same wizard, seeded from the existing log; if a log already has notes/cards,
step 4 is expanded by default on edit.

- **Step 1 · Matchup** — format; your deck; opponent (kind switcher → hero / teammate / archetype /
  reference deck, revealing the matching control). Validates: format + deck chosen, opponent identified.
- **Step 2 · Result** — best-of (pre-selected from the game default); who went first (Me / Opponent); who
  won (Win / Loss / Draw for Bo1, games-won steppers for Bo3/Bo5). Validates: result consistent with
  best-of (`isGameResultConsistent`).
- **Step 3 · Confidence** — the four segmented confidence factors (pre-filled with best defaults) + the
  live "counts as ~X.XX" hint + the primary **Log game** button. This is the fast finish; a fast log is
  three steps.
- **Step 4 · Notes & cards (optional)** — reached via "Add notes & cards" on step 3, or skipped. Holds:
  impressive cards, underperforming cards (each with an ours/theirs tag), learnings, win type, loss reason,
  event, pilot, opponent name. Has its own **Save**.

The live weight preview uses the shared `deriveConfidenceWeight` (unchanged). After save, the user lands on
the game detail hub (unchanged), which shows the derived weight and now the captured cards.

## Game-driven `bestOf` default

- Add `readonly defaultBestOf: BestOf` to the `GameAdapter` contract
  (`apps/api/src/games/game-adapter.interface.ts`). Flesh and Blood → `1`; the Riftbound adapter (phase-12)
  will set `3`.
- New endpoint **`GET /api/game-config`** (team-scoped via `TeamContextGuard`): resolves the adapter from
  the verified `team.gameId` and returns `{ gameId, identityLabel, defaultBestOf }`. Shared response schema
  `gameConfigSchema` in `packages/shared`.
- Web: a `useGameConfig(teamId)` hook (team-scoped query key) feeds the wizard's initial `bestOf`. In edit
  mode the stored value wins.
- `bestOf` stays **required** in `createGameLogSchema` — the game config only sets what the wizard
  pre-selects, never a server-side default.

## Data model — card capture

A new table hanging off `GameLog`, mirroring how `Attendance` hangs off `Event` (no `teamId`; scoped
transitively through its team-owned parent):

```prisma
enum GameLogCardRole { impressive underperforming }
enum GameLogCardSide { ours theirs }

model GameLogCard {
  id        String          @id @default(cuid())
  gameLogId String          @map("game_log_id")
  cardId    String          @map("card_id")
  role      GameLogCardRole
  side      GameLogCardSide
  createdAt DateTime        @default(now()) @map("created_at")

  gameLog GameLog @relation(fields: [gameLogId], references: [id], onDelete: Cascade)
  card    Card    @relation(fields: [cardId], references: [id], onDelete: Cascade)

  @@index([gameLogId])
  @@index([cardId])
  @@map("game_log_card")
}
```

- `GameLogCard` is **not** added to `TEAM_OWNED_MODELS` — like `Attendance`, it is reached only through its
  team-scoped parent `GameLog`, so `teamId` filtering happens on the parent.
- `cardId` is validated against the team's game (cross-game card → `422`), reusing the game-scoped card
  lookup already used elsewhere.
- Shared enums `gameLogCardRoleSchema` / `gameLogCardSideSchema` and a `gameLogCardInputSchema`
  (`{ cardId, side }`) in `packages/shared`.

## API surface

| Method | Path | Change |
|---|---|---|
| `POST` | `/api/game-logs` | Accept optional `impressiveCards[]` / `underperformingCards[]` (each `{ cardId, side }`), validated + persisted. |
| `PATCH` | `/api/game-logs/:gameLogId` | Same arrays; on update they **replace** the existing set for that role (delete-and-recreate within the service). |
| `GET` | `/api/game-logs/:gameLogId` | Detail response nests `impressiveCards` / `underperformingCards` (each `{ cardId, side }`, plus enough to render — card name/pitch/image via the existing card summary shape). |
| `GET` | `/api/game-config` | New. `{ gameId, identityLabel, defaultBestOf }`. |

The create/update schemas keep `confidenceWeight` response-only (unchanged). List responses are unchanged
(cards appear on the detail only).

## Components & boundaries

- **Backend:** extend `GameLogsService` create/update to resolve + persist the card sets (a private helper
  validates each `cardId` in-game and writes `GameLogCard` rows; update replaces per role). A new
  `GameConfigModule` (controller + tiny service) resolves the adapter and returns the config; it depends on
  the `GameAdapterRegistry` + `TenancyModule`.
- **Frontend:** `GameLogForm.tsx` is replaced by `GameLogWizard.tsx` (owns state) + `WizardStepMatchup`,
  `WizardStepResult`, `WizardStepConfidence`, `WizardStepNotes` step components + a small `WizardProgress`
  header. Reuse existing `CardPicker` for the card lists, `HeroPicker`/`FormatPicker`, and
  `deriveConfidenceWeight` for the live hint. `use-games` / `use-game-mutations` extend to send/receive the
  card arrays; add `use-game-config`.

## Testing

- **Shared:** `gameLogCardInputSchema` + enums (valid, bad role/side, empty allowed); create/update schemas
  accept the arrays; `game-config` schema; each FaB adapter exposes `defaultBestOf`.
- **API integration:** card refs persisted with role + side; cross-game card → `422`; update **replaces**
  the set for a role; `GET /api/game-config` returns the adapter default and identity label; tenant
  isolation unchanged (a cross-tenant log's cards never leak). Aggregation-feed test still green.
- **Web component:** each wizard step renders + validates; Next/Back navigation; the fast finish on step 3;
  the game-default pre-selects best-of (mock `game-config`); the step-4 card picker adds a card and tags it
  ours/theirs; edit mode seeds all steps.
- **e2e (phone viewport):** walk the 3-step fast path → Log game → see the weight hint and the game in the
  list; a second run opens step 4, adds an impressive card, saves, and sees it on the detail hub.

## Verification

`pnpm --filter @teambrewer/api db:migrate`; `pnpm test`; `pnpm test:e2e`; `pnpm lint && pnpm typecheck` —
all green, evidence shown. Then update the docs below and integrate the branch fast-forward to `main`.

## Docs to update (in the same change)

- `docs/features/game-logging.md` — the wizard UX + card capture.
- `docs/architecture/data-model.md` — `GameLogCard`.
- `docs/architecture/game-abstraction.md` — `defaultBestOf` on the adapter contract + the game-config seam.

## Risks / open considerations

- **Wizard state size:** one component holding all fields is fine at this scale; if it grows unwieldy,
  extract a `useGameLogForm` hook — but not preemptively (YAGNI).
- **Replace-on-update for cards** is simplest and matches how the form thinks ("here's the current set");
  add/remove deltas are unnecessary for the volumes involved.
- **`GameLogCard` without `teamId`** relies on the parent-scoping pattern; the integration tests must
  explicitly prove a cross-tenant log's cards are unreachable (defense against the pattern being wrong).
