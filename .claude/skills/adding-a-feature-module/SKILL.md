---
name: adding-a-feature-module
description: Use when adding or extending a TeamBrewer feature module (backend NestJS module + matching frontend feature). Ensures the standard modular, team-scoped, tested structure so every feature looks the same.
---

# Adding a Feature Module

Every TeamBrewer feature follows the same shape so the codebase stays predictable. Use this when creating
a new feature or a substantial slice of one.

## Backend (NestJS) — `apps/api/src/<feature>/`

A module is self-contained:

```
apps/api/src/decks/
  decks.module.ts        # wires controller + service
  decks.controller.ts    # routes, role guards, TeamContextGuard
  decks.service.ts       # business logic; ALL queries teamId-scoped
  decks.repository.ts    # (optional) Prisma access via the team-scoped helper
  dto/                   # request/response DTOs = z.infer of shared schemas
  decks.service.spec.ts  # unit/integration tests incl. tenant isolation
```

Checklist:
- [ ] Request/response **Zod schemas live in `packages/shared`**; DTOs infer from them.
- [ ] Controller applies **auth + role + `TeamContextGuard`**; default-deny.
- [ ] Service takes the **verified `teamId`** from request context; **every** query is `teamId`-scoped;
      writes stamp `teamId` from context (never from body).
- [ ] Cross-team foreign keys validated to share the `teamId`.
- [ ] **Tenant-isolation tests** + happy-path + validation + authZ tests (see
      [`.claude/rules/testing.md`](../../rules/testing.md)).
- [ ] No game-specific assumptions in shared/core — go through the game adapter if needed
      ([game-abstraction](../../../docs/architecture/game-abstraction.md)).
- [ ] Prisma migration added; conceptual model matches
      [data-model](../../../docs/architecture/data-model.md).

## Frontend (React) — `apps/web/src/features/<feature>/`

```
apps/web/src/features/decks/
  components/            # UI (shadcn/ui-based), responsive/mobile-first
  hooks/                 # useDecks, useCreateDeck… (TanStack Query)
  api.ts                 # typed API calls (parse with shared Zod)
  index.ts
```

Checklist:
- [ ] Data via **TanStack Query**; **query keys include the active `teamId`**.
- [ ] Parse responses with the shared Zod schema at the boundary.
- [ ] Mobile-first, accessible; matches [frontend](../../../docs/architecture/frontend.md).
- [ ] Component/hook tests (Vitest + Testing Library).

## Shared — `packages/shared/`

- [ ] Add the feature's Zod schemas + inferred types; export them for both apps.
- [ ] Keep cross-game enums here; game-specific value sets come from the adapter/reference data.

## Finish

- [ ] Conventional-commit atomically; keep the tree green.
- [ ] Update the feature spec/docs if behavior differs from what's written (same change).
