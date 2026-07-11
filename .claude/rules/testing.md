# Rule: Testing

The app must be **well tested**. Full strategy: [testing-strategy](../../docs/architecture/testing-strategy.md).

## Non-negotiables

1. **Test-first (TDD).** Write a failing test expressing the behavior, make it pass, refactor. Use the
   superpowers `test-driven-development` skill.
2. **Every team-owning module has tenant-isolation tests** proving a user cannot read/write another team's
   data (forged `teamId` → 404/empty/403). No exceptions.
3. **Test behavior, not implementation** — tests should survive refactors.
4. **Deterministic** — no live network or real card-data endpoints (use fixtures); no wall-clock
   dependence.
5. **A phase is not "done"** until its verification section passes with evidence (superpowers
   `verification-before-completion`). Never claim green without running the commands.

## Coverage expectations

- **Must-cover (high rigor):** confidence-weight formula, matchup aggregation, tenancy guard, auth flows,
  card-sync mapping/idempotency, status-transition rules.
- Happy path + validation failure + authZ (401/403/cross-tenant) for every endpoint.
- Aggregations tested with crafted datasets → known expected numbers.
- Don't chase 100% on glue/config; do cover business logic thoroughly.

## Tools

- **Vitest** — unit + integration (integration uses an ephemeral Postgres with migrations).
- **Testing Library** — React components/hooks.
- **Playwright** — e2e for critical journeys (setup→TOTP→app; log a game; switch teams isolation).
- **Factories/fixtures** — helpers to create users/teams/memberships/decks with correct `teamId`,
  including a two-team helper for isolation tests.

## CI

Lint + typecheck + unit/integration on every push; e2e on main flows. See phase-00.
