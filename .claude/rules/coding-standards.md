# Rule: Coding Standards

Applies to all code in this repository.

## Naming (strict)

- **Never abbreviate** variable, function, type, file, route, or column names. Use explicit names that
  reflect the business domain: `confidenceWeight` not `cw`, `teamMembership` not `tm`,
  `expectedMetaShare` not `share`. This is a hard project rule (and the user's global preference).
- Booleans read as predicates: `isReference`, `hasBackupCodes`.
- Match the surrounding code's idiom and casing conventions.

## Language & structure

- **TypeScript everywhere**, `strict` mode on. No implicit `any`; avoid `any` — prefer precise types or
  `unknown` + narrowing.
- **Feature-first modularity.** Backend: one NestJS module per feature (controller + service + Prisma
  access + DTOs). Frontend: one folder per feature under `apps/web/src/features/`. Mirror the
  [feature specs](../../docs/features/).
- **Small, focused files.** If a file does too much, split it. Prefer clear interfaces between units so
  each can be understood and tested in isolation.
- **Single source of truth for types:** request/response shapes are **Zod schemas in `packages/shared`**;
  infer TS types from them. Do not duplicate types across web/api.
- **No hard-coded game specifics** (formats, "hero", pitch) in shared/core code — route through the game
  adapter / reference data. See [game-abstraction](../../docs/architecture/game-abstraction.md).

## API & data

- Follow [api-conventions](../../docs/architecture/api-conventions.md): REST, error envelope, cursor
  pagination, camelCase JSON / snake_case DB.
- Every team-owned query is `teamId`-scoped from the verified request context — see
  [security-and-tenancy](security-and-tenancy.md).

## Documentation & current best practices

- For any library/framework/API decision or usage, **consult current official docs** (this project's docs
  MCP or the web) rather than relying on memory — the ecosystem moves fast, and this is a user preference.
- Keep `docs/` the source of truth. If code changes a decision, update the relevant doc/ADR **in the same
  change**.

## Comments

- Comment the *why*, not the *what*. Match the surrounding comment density. No dead code, no commented-out
  blocks left behind.

## When unclear — ask

Do not invent requirements. If a spec is ambiguous, ask a clarifying question before implementing (user
preference; also the brainstorming discipline).
