# Rule: Security & Tenancy

The two hard security properties: **tenant isolation** and **strict access control**. Full detail:
[multi-tenancy](../../docs/architecture/multi-tenancy.md) · [security](../../docs/architecture/security.md).

## Tenant isolation (must)

- Every team-owned row has a non-null **`teamId`**.
- The **active team is verified against the user's memberships** on every request. **Never** trust a
  client-supplied `teamId` for scoping; **never** read `teamId` from a request body for writes — take it
  from the verified request context.
- **Every** query on team-owned data is filtered by the request's `teamId`. Prefer a mandatory data-access
  helper/base repository that injects it so it can't be forgotten.
- Cross-team foreign keys are validated to share the same `teamId`.
- Cross-tenant reads return **404** (not a detailed 403) to avoid enumeration; log the attempt server-side.
- **Frontend:** every TanStack Query key includes the active `teamId`; switching teams invalidates
  team-scoped caches; never render two teams' data together.
- **Test it:** every team-owning module ships isolation tests. Non-negotiable.

## Access control (must)

- **Default-deny.** Every endpoint checks: authenticated → correct role → tenant membership.
- Roles: instance-admin (global), team-admin (per team), member. Enforce per the capability table in
  [multi-tenancy](../../docs/architecture/multi-tenancy.md).
- No open signup; accounts are admin-created. **TOTP 2FA is mandatory.**

## Auth & data handling (must)

- Setup/reset tokens: hashed at rest, single-use, short expiry, rate-limited. See
  [ADR-0003](../../docs/decisions/0003-no-email-auth.md).
- Validate all input with shared Zod schemas. CSRF protection for cookie auth; CORS locked to app origin.
- Never log secrets/PII. Secrets via env/Docker secrets; never committed.
- TeamBrewer never collects payment/financial data or government IDs.

## External data (must)

- **No scraping.** External decks/meta are referenced by link only. Card data comes from sanctioned open
  sources; respect their terms and attribute them. See
  [ADR-0007](../../docs/decisions/0007-external-data-approach.md) and [data-sources](data-sources.md).
