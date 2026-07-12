# Phase 11 — Dashboard

## Goal

Give each member and the team a single **read/aggregation surface** that answers "what should I do next?":
my assigned tests, coverage gaps in the current gauntlet, upcoming events with my attendance and deck
selection, recent results, and a ranked **"what to test next"** recommendation that combines
**expected metagame share × coverage gaps**. The dashboard introduces **no new core entities** — it reads
and composes what phases 05, 07, and 08 already own. It realizes
[playtesting-methodology §3 — Allocate practice by expected frequency](../domain/playtesting-methodology.md).

## Depends on

Per the [roadmap graph](README.md):

- [phase-05 — Events & Gauntlets](phase-05-events-and-gauntlets.md) — events, gauntlet entries
  (`expectedMetaShare`), attendance, deck selections.
- [phase-07 — Matchups & Coverage](phase-07-matchups-and-coverage.md) — matchup aggregation and coverage
  gaps (which matchups are still thin).
- [phase-08 — Testing Queue](phase-08-testing-queue.md) — test assignments (what I'm on) and suggestions.

## Implements

- Feature spec: [dashboard](../features/dashboard.md)
- ADRs: [ADR-0008 multi-tenant-teams](../decisions/0008-multi-tenant-teams.md) (aggregates are
  team-scoped), [ADR-0004 event-centric](../decisions/0004-event-centric.md) (event is the organizing hub),
  [ADR-0005 confidence-weight-model](../decisions/0005-confidence-weight-model.md) (coverage/trust feeds
  the recommendation)
- Methodology: [playtesting-methodology §3](../domain/playtesting-methodology.md) (and §2 coverage)

## Scope

- A **read-only aggregation module** in the API (`apps/api/src/dashboard`) that composes existing services;
  it must not duplicate their storage. All reads scoped by the verified `teamId`; the "personal" slices
  additionally filter by the authenticated `userId`.
- **Personal dashboard** (for the active user in the active team):
  - My open **test assignments** (from the testing queue), with the target opponent and any target games.
  - **Upcoming events** I'm attending, my **attendance** status, and my **deck selection** (or a prompt to
    pick/lock one).
  - **Recent results** involving me (from game logs) — compact win/loss summary.
- **Team dashboard**:
  - **Coverage gaps** for the nearest upcoming event's gauntlet — matchups below the confidence/sample
    threshold and who is assigned.
  - **Recent team results** and activity highlights.
- **"What to test next" recommendation** — a ranked list of `(our deck × opponent archetype)` pairings.
  Ranking score combines the gauntlet entry's **`expectedMetaShare`** with the **coverage gap** (how far
  the current effective sample / trust sits below target). High expected share + thin coverage ranks
  highest. The exact formula is a small, **pure, unit-tested function** in `packages/shared` (or a shared
  domain util) so it is deterministic and testable independent of I/O.
- **Mobile-first** layout; the dashboard is the likely landing screen, so it must be fast and thumb-first.

## Deliverables

- A pure ranking function, e.g. `rankTestingPriorities(input): RankedPriority[]`, in `packages/shared`
  with a documented, deterministic scoring rule (inputs: expected meta share, effective sample vs target,
  trust bucket; output: ordered pairings with a score and a human-readable reason).
- Dashboard API endpoints returning composed, team-scoped payloads, validated by shared Zod schemas:
  - `GET /api/dashboard/me` (personal) and `GET /api/dashboard/team` (team), scoped to the active event
    where relevant (nearest upcoming, or a selectable `?eventId=`).
- Frontend `apps/web/src/features/dashboard/` with a personal view and a team view (tabbed or sectioned),
  each section deep-linking into the owning feature (assignment → testing queue, gap → matchup matrix,
  event → event page).
- TanStack Query keys include `teamId` (and `userId`/`eventId` where relevant); switching teams
  invalidates dashboard queries.

## Task checklist (test-first, ordered)

- [x] Read [dashboard](../features/dashboard.md), the phase-05/07/08 plans + their feature specs,
      [data-model](../architecture/data-model.md), and [playtesting-methodology](../domain/playtesting-methodology.md).
- [x] Specify the ranking formula in the plan/spec (inputs, weighting, tie-breaks); get it unambiguous
      before coding — if the weighting is unclear, ask rather than guess.
- [x] Write failing unit tests for `rankTestingPriorities` with **crafted data** producing a known order
      (e.g. high share + zero games outranks low share + thin coverage outranks well-covered); include
      tie-break and empty-gauntlet cases. Then implement the pure function.
- [x] Write failing integration tests for `GET /api/dashboard/me` and `/team` composing fixture data
      (assignments, events, attendance, selections, game logs, gauntlet) for a team; assert the shapes and
      the recommendation order. Then implement the dashboard module by calling existing services.
- [x] Add tenant-isolation integration tests (below); make them pass.
- [x] Build the personal dashboard UI (assignments, upcoming events + my attendance/selection, recent
      results) with deep links; component-test rendering + empty states.
- [x] Build the team dashboard UI (coverage gaps, recent results, recommendation list with reasons).
- [x] Verify query keys are team-scoped; add the switch-teams invalidation test.
- [x] Run the full verification below; update the [roadmap Status table](README.md).

**Decisions made (with the user), realized in this phase:**
- The dashboard ranks **per opponent archetype** (one row per gauntlet target, aggregating all our reps),
  matching this spec's formula and the coverage tracker — not per (our-deck × opponent) pairing.
- The dashboard is the **authenticated landing** at `/`; the team roster moved to a new `/team` route + nav
  entry. Endpoints are `GET /api/dashboard/me` and `GET /api/dashboard/team` (per this plan's deliverable).
- Query keys are team-scoped (`teamId` first), so the global team-switch invalidation already covers them;
  the switch-teams behavior is proven by the dashboard e2e (personal isolation) rather than a bespoke unit.

## Tests & verification

**Recommendation ranking (signature logic).** Table-driven unit tests over `rankTestingPriorities` with
crafted inputs asserting the exact output order and scores — at minimum: (a) higher `expectedMetaShare`
with equal coverage ranks first; (b) equal share, thinner coverage (lower effective sample / weaker trust
bucket) ranks first; (c) a well-covered high-share matchup is deprioritized below an uncovered
moderate-share one; (d) empty gauntlet → empty result; (e) deterministic tie-break. This is the must-cover
core of the phase per [testing-strategy](../architecture/testing-strategy.md).

**Tenant isolation (mandatory).** The dashboard aggregates team data, so it must prove no cross-team bleed:
- A user in team A calling the dashboard with a forged `X-Team-Id` for team B gets 404/403 — never team B
  aggregates.
- The **personal** dashboard for a user who belongs to both A and B shows only the active team's
  assignments/events/results — no rows leak from the other team.
- Aggregated counts computed for team A never include any team B `GameLog`/assignment/gauntlet row (assert
  with a two-team fixture where both have data).

**Composition correctness.** With a crafted fixture, assert my-assignments count, upcoming-events list,
and recent-results summary match the underlying data exactly.

**End-to-end steps to prove it works:**
1. `pnpm test` — unit (ranking) + integration (composition + isolation) green.
2. `pnpm dev`; seed team A with an event + gauntlet (varied `expectedMetaShare`), some game logs, and
   assignments; open the dashboard and confirm the "what to test next" order matches the expected ranking
   and that deep links navigate to the right feature.
3. Switch to team B and confirm the dashboard shows only team B's data.
4. Check the personal dashboard on a mobile viewport — fast, thumb-friendly, correct empty states.
5. `pnpm lint && pnpm typecheck` clean.

## Out of scope

- Any new persisted entity or new domain rule — the dashboard only reads/aggregates.
- Charts/analytics beyond the specified summaries and ranked list (no historical trend graphs yet).
- Notification digests / email (there is no email — see [ADR-0003](../decisions/0003-no-email-auth.md)).
- Cross-team ("all my teams at once") views — the UI shows one team at a time
  ([multi-tenancy](../architecture/multi-tenancy.md)).
- PWA offline caching of the dashboard — that is [phase-13](phase-13-polish-pwa-hardening.md).

## See also

- Feature: [dashboard](../features/dashboard.md) ·
  [confidence-and-matchups](../features/confidence-and-matchups.md) ·
  [testing-queue](../features/testing-queue.md) · [events-and-gauntlets](../features/events-and-gauntlets.md)
- Architecture: [data-model](../architecture/data-model.md) · [multi-tenancy](../architecture/multi-tenancy.md) ·
  [api-conventions](../architecture/api-conventions.md) · [frontend](../architecture/frontend.md) ·
  [testing-strategy](../architecture/testing-strategy.md)
- Decisions: [ADR-0004 event-centric](../decisions/0004-event-centric.md) ·
  [ADR-0005 confidence-weight-model](../decisions/0005-confidence-weight-model.md) ·
  [ADR-0008 multi-tenant-teams](../decisions/0008-multi-tenant-teams.md)
- Domain: [playtesting-methodology](../domain/playtesting-methodology.md)
- Prior phases: [phase-05](phase-05-events-and-gauntlets.md) ·
  [phase-07](phase-07-matchups-and-coverage.md) · [phase-08](phase-08-testing-queue.md)
- Skills: [`implementing-a-phase`](../../.claude/skills/implementing-a-phase/SKILL.md)
