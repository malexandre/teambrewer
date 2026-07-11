# API Conventions

Conventions for the NestJS REST API in `apps/api`. Consistency here is what makes the app predictable for
incremental, agent-built development.

## Shape & style

- **REST, resource-oriented, JSON.** Base path `/api`. Plural nouns: `/api/decks`, `/api/events`,
  `/api/game-logs`, `/api/events/:eventId/gauntlet-entries`.
- **Verbs:** `GET` (read), `POST` (create), `PATCH` (partial update), `DELETE` (archive/soft-delete).
- **Status codes:** 200/201 success, 204 no content, 400 validation, 401 unauthenticated, 403 forbidden
  (incl. tenant violations), 404 not found, 409 conflict, 422 domain-rule violation.

## Tenancy (see [multi-tenancy](multi-tenancy.md))

- The **active team** is supplied by the client via the **`X-Team-Id` request header** (convention chosen
  in phase-01; used everywhere) and **verified** by `TeamContextGuard`.
- **Never** accept `teamId` in a request body for scoping; it is taken from the verified context and
  stamped on writes.
- Global reference endpoints (cards/formats/heroes) are filtered by the active team's `gameId`.

## Validation & types (single source of truth)

- Every request/response body has a **Zod schema in `packages/shared`**. The API validates input with it
  (via a Nest pipe) and the web infers TypeScript types from the same schema — **no duplicated types**.
- DTOs = `z.infer<typeof Schema>`. Keep schemas close to the feature, re-exported from `packages/shared`.

## Errors

Uniform error envelope:

```json
{ "error": { "code": "DECK_NOT_FOUND", "message": "Human-readable message", "details": { } } }
```

- `code` is a stable machine string; `message` is safe to show; `details` optional (e.g. field errors).
- A global exception filter maps thrown domain errors and Zod failures to this envelope.
- **Never leak** whether a resource exists in another team — return 404 (not 403 with detail) for
  cross-tenant reads to avoid enumeration, while still logging the attempt server-side.

## Pagination, filtering, sorting

- **Cursor-based pagination** for lists: `?limit=&cursor=`, response `{ data: [...], nextCursor }`.
- Filters as explicit query params (`?formatId=&status=&eventId=`); document allowed values per endpoint.
- Sort via `?sort=field:asc|desc` from an allow-list.

## Conventions

- **snake_case** in the database, **camelCase** in API JSON and TypeScript (Prisma maps between them).
  TeamBrewer domain tables snake_case their columns via Prisma `@map`. The Better Auth-owned tables
  (`user`, `session`, `account`, `verification`, `two_factor`) keep Better Auth's native camelCase Prisma
  field names (required by the library) but are still snake_cased in the database via `@map` (phase-01).
- **Timestamps** are ISO-8601 UTC strings in JSON.
- **IDs** are opaque strings; never expose sequential integers.
- **Idempotency** for imports/sync jobs (upsert by stable key).
- **No abbreviations** in field or route names (see [`coding-standards`](../../.claude/rules/coding-standards.md)).

## Auth endpoints

Better Auth mounts its own handlers (sessions, TOTP, backup codes). Admin flows (create user, generate
setup/reset link, manage membership) are custom endpoints guarded by role. See
[security](security.md) and the `accounts-and-auth` / `teams-and-membership` specs.

## OpenAPI

Expose OpenAPI (NestJS Swagger) for the API in development to keep the contract inspectable. Keep it in
sync via decorators + the shared Zod schemas.
