# Frontend Architecture

`apps/web` is a **React + Vite + TypeScript SPA**, PWA-enabled, mobile-first. It consumes the API and
shares types/validation with it via `packages/shared`.

Related: [tech-stack](tech-stack.md) · [api-conventions](api-conventions.md) · [multi-tenancy](multi-tenancy.md).

## Stack

- **React + Vite** (static build, served by Nginx).
- **TanStack Router** — type-safe routing.
- **TanStack Query** — server-state cache, invalidation, optimistic updates.
- **Tailwind CSS + shadcn/ui** — responsive, accessible, **ownable** components (code lives in our repo).
- **Zod** (from `packages/shared`) — validate/parse API responses; infer types.
- **PWA** — installable, offline-tolerant caching of card data and read-only views.

## Structure (feature-first)

```
apps/web/src/
  app/            # app shell, providers (router, query, theme, active-team)
  routes/         # route definitions (TanStack Router)
  features/       # one folder per feature module, mirroring docs/features/*
    decks/        # components, hooks (useDecks…), api client, types
    events/
    game-logging/
    matchups/
    ...
  components/     # shared UI primitives (shadcn/ui-based)
  lib/            # api client, query keys, formatting, auth helpers
  styles/
```

Each feature folder is self-contained (components + data hooks + API calls). Keep files focused; split
when they grow. Mirror the backend module names and the [feature specs](../features/).

## Active-team context (critical)

- A React context holds the **active team**; a **team selector** (only the user's teams) switches it.
- **Every query key includes the active `teamId`** so caches never bleed across teams. Switching teams
  invalidates/`resets` team-scoped queries.
- All API calls include the active-team indicator (header or path per [api-conventions](api-conventions.md)).
- The UI renders exactly one team's data at a time — never merged.

## Data fetching

- All server state goes through **TanStack Query** (no ad-hoc fetch-in-component).
- Query keys: `[teamId, resource, params]`. Mutations invalidate the relevant keys.
- Parse responses with the shared Zod schema at the boundary; components consume typed data.

## Mobile & responsiveness (first-class)

- **Mobile-first** layouts; test at phone widths. The most common phone flow — **logging a game right
  after playing** — must be fast and thumb-friendly.
- Responsive matchup matrix (horizontal scroll / condensed view on small screens).
- Respect safe areas; large tap targets; minimal typing (pickers, autocomplete).

## Card UX

- **Autocomplete** card pickers (name + pitch for FaB) backed by the card DB.
- **Hover/press preview** of a card's image anywhere a card is referenced (suggestions, game-plans,
  primers); the image is the detail (lean card model). See [card-database](../features/card-database.md).

## Accessibility & theming

- Keyboard-navigable, ARIA-correct components (shadcn/ui/Radix baseline).
- Light/dark theme.

## Auth UX

- Setup-link landing page: set password → set up TOTP (QR) → show backup codes → done.
- Login: password → TOTP. Graceful "ask your admin for a reset link" (no email) messaging.

## Testing

- Component/hook tests with Vitest + Testing Library; critical journeys with Playwright (including a
  tenant-isolation e2e: switching teams shows only that team's data). See
  [testing-strategy](testing-strategy.md).
