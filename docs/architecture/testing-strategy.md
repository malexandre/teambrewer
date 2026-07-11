# Testing Strategy

The app must be **well tested**. Testing is not an afterthought bolted on at the end — it is
**test-first**, and every phase ships with tests and a verification step. Rule of record:
[`../../.claude/rules/testing.md`](../../.claude/rules/testing.md).

## Principles

1. **TDD by default.** Write a failing test that expresses the behavior, make it pass, refactor. See the
   superpowers `test-driven-development` skill.
2. **Test behavior, not implementation.** Tests should survive refactors.
3. **Tenant isolation is always tested.** Every module that owns team data proves a user cannot reach
   another team's data. This is non-negotiable.
4. **Fast feedback.** Unit/integration tests run in seconds; e2e covers critical journeys.
5. **Deterministic.** No reliance on network, real card-data endpoints (use fixtures), or wall-clock.

## The pyramid

| Level | Tool | Scope | Examples |
|---|---|---|---|
| **Unit** | Vitest | Pure logic, no I/O | confidence-weight formula; matchup aggregation math; Zod schema edge cases; adapter card mapping |
| **Integration** | Vitest + test DB | Service + Prisma + guards, real Postgres (test container/schema) | deck CRUD scoped to team; tenant guard rejects cross-team; card sync upsert idempotency |
| **Component** | Vitest + Testing Library | React components/hooks | game-log form validation; matchup matrix rendering; team selector |
| **E2E** | Playwright | Full stack through the browser | setup-link → set password → TOTP → land in team; log a game; switch teams shows only that team |

## What to test per module (baseline)

- **Happy path** for each endpoint/flow.
- **Validation failures** (bad input rejected with the right error envelope).
- **AuthZ**: unauthenticated → 401; wrong role → 403; **cross-tenant → 404/empty**.
- **Domain rules** specific to the feature (e.g. confidence weight in `[0,1]`; expected-metagame shares;
  suggestion status transitions).
- **Aggregations** with crafted datasets producing known expected numbers.

## Signature-feature tests (call out explicitly)

- **Confidence weight**: table-driven tests mapping factor combinations → expected weight
  (per [ADR-0005](../decisions/0005-confidence-weight-model.md)).
- **Matchup aggregation**: given a set of `GameLog`s with known weights/results, assert weighted win rate,
  raw N, effective sample, and trust indicator bucket.
- **Coverage tracker**: given games + gauntlet, assert which matchups fall below threshold.

## Tooling & CI

- **Test DB:** ephemeral Postgres (Docker) with migrations applied; reset between tests.
- **Factories/fixtures:** helpers to create a user, team, membership, deck, etc., defaulting `teamId`
  correctly — including helpers to set up **two teams** for isolation tests.
- **Coverage:** track coverage; treat critical logic (confidence, aggregation, tenancy, auth) as
  must-cover. Aim high on business logic; don't chase 100% on glue.
- **Local-first CI:** the verification bar is running lint + typecheck + unit/integration (and e2e on main
  flows) **locally** via the `pnpm` scripts. The GitHub Actions workflow runs the same steps on push **once
  a remote is configured** (deferred — see [git-and-commits](../../.claude/rules/git-and-commits.md)).
- **A phase is not done** until its verification section passes **locally** (see each phase plan) — evidence
  before claiming completion (superpowers `verification-before-completion`).
