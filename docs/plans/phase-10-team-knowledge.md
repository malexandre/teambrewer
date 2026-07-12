# Phase 10 — Team Knowledge

## Goal

Give a team durable, findable knowledge so conclusions stop getting lost in chat and the same debates
stop repeating: **primers** (long-form deck/matchup/format writeups), a **decisions log** (what the team
decided and why), and **polls** (structured group choices). All commentable via the collaboration core, all
strictly team-scoped. This directly serves
[playtesting-methodology §5 — Communication is the #1 factor](../domain/playtesting-methodology.md).

> **Decision (with the user), recorded here as done.** Long-form bodies (primers, decisions) render as
> **plain `whitespace-pre-wrap` text**, authored in a plain `<textarea>` — **not** a markdown editor +
> sanitized renderer. This keeps the codebase convention established through phase-09 (game-plans) and adds
> **no markdown/sanitizer dependency**. React escapes text content, so a body containing HTML/script renders
> literally and is never executed (covered by a component test) — the "markdown safety" requirement is met
> by escaping, not by a sanitizer. The scope/deliverables/verification below are updated to match.

## Depends on

- [phase-04 — Collaboration Core](phase-04-collaboration-core.md) — comments, mentions, activity feed, and
  notifications are reused here (primers and decisions are commentable subjects). This is the only hard
  dependency per the [roadmap graph](README.md).

Primers may reference a deck (`relatedDeckId`), so [phase-03 — Decks](phase-03-decks.md) is transitively
present (phase-04 depends on it). Do **not** add a hard dependency on later phases.

## Implements

- Feature spec: [team-knowledge](../features/team-knowledge.md)
- ADR: [ADR-0008 multi-tenant-teams](../decisions/0008-multi-tenant-teams.md) (isolation),
  [ADR-0006 game-agnostic-core](../decisions/0006-game-agnostic-core.md) (no game-specific assumptions in
  knowledge content — it is free-form markdown; the module must not hard-code "hero"/formats)
- Methodology: [playtesting-methodology §5](../domain/playtesting-methodology.md)

## Scope

Three new team-scoped domain entities plus poll voting, their API modules, and their frontend surfaces.

- **Primer** `{ id, teamId, authorId, title, kind: 'deck_primer' | 'matchup' | 'format_notes' | 'other',
  relatedDeckId?, body (markdown), visibility: 'team' | 'private', archivedAt? }`.
- **Decision** `{ id, teamId, authorId, title, context, decision, rationale, relatedSubjectRef?
  (polymorphic { subjectType, subjectId } — e.g. a deck, event, or primer), decidedAt }`.
- **Poll** `{ id, teamId, authorId, question, options[] (ordered { id, label }), closesAt?,
  status: 'open' | 'closed' }` with **PollVote** `{ id, pollId, userId, optionId }`.
- **Bodies**: authored as plain text in a `<textarea>` and rendered as `whitespace-pre-wrap` text on read
  (no markdown library; React escapes the content — see the decision note above). Card hover-preview inside
  bodies is a nice-to-have but **out of scope** here (see below).
- **Comments**: attach primers and decisions as collaboration `subjectType`s so existing threaded
  comments/mentions/activity/notifications work unchanged.

## Deliverables

- Prisma migration adding `Primer`, `Decision`, `Poll`, `PollVote` with composite `(teamId, ...)` indexes,
  `PollVote` unique on `(pollId, userId)`, and soft-delete (`archivedAt`) on `Primer` and `Decision`.
- Zod schemas in `packages/shared` for each entity (create/update/read DTOs), including the `kind`,
  `visibility`, and poll `status` enums and the `relatedSubjectRef` polymorphic ref.
- NestJS modules `apps/api/src/knowledge/primers`, `.../decisions`, `.../polls` — all queries scoped by the
  verified request `teamId`; writes stamp `teamId` from context, never from the body.
- Poll voting endpoint enforcing **one vote per user per poll** (change-vote allowed while open),
  **rejecting votes on closed polls**, and a **close** action (manual close by author/admin; a poll past
  `closesAt` is treated as closed and computes final results).
- Collaboration wiring: register `primer` and `decision` as commentable subject types; emit activity
  events on create/close.
- Frontend feature folders under `apps/web/src/features/knowledge/`:
  - **Primers library** — list/filter by `kind` and related deck; create/edit with a plain-text body field;
    a read view (pre-wrapped text) with a comment thread.
  - **Decisions log** — reverse-chronological list; each entry shows context / decision / rationale and its
    related subject link; create/edit; comment thread.
  - **Polls** — create a poll (question + options + optional `closesAt`); vote; live results (counts +
    percentages) with a clear open/closed state; close action for author/admin.
- Mobile-first, accessible (keyboard, ARIA) per [frontend](../architecture/frontend.md).

## Task checklist (test-first, ordered)

- [x] Read [team-knowledge](../features/team-knowledge.md), [collaboration-core](../features/collaboration-core.md),
      [data-model](../architecture/data-model.md), [multi-tenancy](../architecture/multi-tenancy.md), and
      the [`implementing-a-phase`](../../.claude/skills/implementing-a-phase/SKILL.md) and
      [`adding-a-feature-module`](../../.claude/skills/adding-a-feature-module/SKILL.md) skills.
- [x] Write the shared Zod schemas + enums; unit-test schema edge cases (empty options, ≥2 options
      required, distinct options, valid `closesAt`, valid `relatedSubjectRef` shape).
- [x] Write failing integration tests for Primer CRUD scoped to a team (happy path + cross-tenant 404 +
      unauthenticated 401); then implement the primers module + migration to pass them.
- [x] Write failing integration tests for Decision CRUD (same isolation matrix + `relatedSubjectRef`
      round-trips and is validated to reference same-team subjects); then implement the decisions module.
- [x] Write failing integration tests for Poll create + PollVote: one vote per user, change-vote while
      open, reject vote on closed/expired poll, close transitions `status`, results math; then implement
      the polls module.
- [x] Add the migration; run it against the test DB; assert indexes/unique constraints exist.
- [x] Register `primer` and `decision` as collaboration subject types; test that a comment + @mention on a
      primer creates a notification and an activity event, all team-scoped.
- [x] Enforce visibility: a `private` primer is readable only by its author (and team-admin per the
      feature spec); write a test proving another member gets 404.
- [x] Build the primers library (list/create/edit/read) with a plain-text body; component-test that a
      script/HTML body renders as literal escaped text (React escapes it — no sanitizer dependency).
- [x] Build the decisions log and polls UI (create/vote/results/close); component-test poll results
      rendering and the disabled-vote state on closed polls.
- [x] Wire TanStack Query keys to include `teamId`; verify switching teams invalidates knowledge queries.
- [x] Run the full verification below; update the [roadmap Status table](README.md).

## Tests & verification

**Tenant isolation (mandatory).** For each of Primer, Decision, Poll: a member of team A cannot read or
write team B's rows even with a forged `X-Team-Id` — expect 404 (cross-tenant read) / 403 (guard). A
`PollVote` cannot be cast on another team's poll. A `Decision.relatedSubjectRef` cannot point at a
cross-team subject. Include a two-team fixture per [testing-strategy](../architecture/testing-strategy.md).

**Poll domain rules.**
- One vote per `(pollId, userId)` — a second vote updates, never duplicates (assert unique constraint +
  service behavior).
- Voting on a `closed` poll, or a poll whose `closesAt` has passed, is rejected (422).
- Closing a poll is idempotent; results (counts + percentages) match crafted vote sets exactly.

**Visibility.** `private` primer hidden from other members (404); `team` primer visible to all members.

**Body safety.** A body containing HTML/script renders as literal, escaped text (React escapes text
content — no sanitizer dependency); a component test asserts a `<script>`-laden primer body is shown
verbatim and injects no `<script>` element.

**Collaboration integration.** Commenting + @mentioning on a primer/decision produces a scoped
notification + activity event.

**End-to-end steps to prove it works:**
1. `pnpm --filter api prisma migrate dev` — migration applies cleanly.
2. `pnpm test` — unit + integration green, including the isolation and poll-rule tests above.
3. `pnpm dev`; in team A: create a primer (body renders as pre-wrapped text), comment + @mention a
   teammate (they get a notification), log a decision, create a poll, vote, then close it and confirm
   final results.
4. Switch to team B (team selector) and confirm none of team A's knowledge appears.
5. `pnpm lint && pnpm typecheck` clean.

## Out of scope

- Card hover-preview / autocomplete **inside** bodies (revisit with card UX work).
- A markdown editor + sanitized renderer (deferred by decision — bodies are plain pre-wrapped text).
- Rich collaborative/real-time co-editing; version history/diffing of primers (single-author edit is fine).
- Ranked-choice / multi-select polls (single-choice only for now).
- Dashboard surfacing of knowledge — the dashboard is [phase-11](phase-11-dashboard.md).
- Any game-specific knowledge templates.

## See also

- Feature: [team-knowledge](../features/team-knowledge.md) · [collaboration-core](../features/collaboration-core.md)
- Architecture: [data-model](../architecture/data-model.md) · [multi-tenancy](../architecture/multi-tenancy.md) ·
  [api-conventions](../architecture/api-conventions.md) · [frontend](../architecture/frontend.md) ·
  [testing-strategy](../architecture/testing-strategy.md)
- Decisions: [ADR-0008 multi-tenant-teams](../decisions/0008-multi-tenant-teams.md) ·
  [ADR-0006 game-agnostic-core](../decisions/0006-game-agnostic-core.md)
- Domain: [playtesting-methodology](../domain/playtesting-methodology.md)
- Prior phase: [phase-04 — Collaboration Core](phase-04-collaboration-core.md)
- Skills: [`implementing-a-phase`](../../.claude/skills/implementing-a-phase/SKILL.md) ·
  [`adding-a-feature-module`](../../.claude/skills/adding-a-feature-module/SKILL.md)
