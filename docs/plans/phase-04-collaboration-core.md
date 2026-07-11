# Phase 04 — Collaboration Core

**Goal** — Build the shared collaboration subsystem that later modules attach to, and prove it by
retrofitting it onto decks. Communication is the #1 differentiator for successful teams
([playtesting-methodology §5](../domain/playtesting-methodology.md)), so this subsystem is built early:
polymorphic **comments** (threaded), **@mentions** that generate **notifications**, an **activity feed**, and
an in-app **notification center** — all with **no email** ([ADR-0003](../decisions/0003-no-email-auth.md)).
It ships a reusable **attach pattern** so any future subject (events, game logs, suggestions, primers) can
gain comments + activity by declaring a subject type, and it wires that pattern into **decks** as the first
consumer.

**Depends on** — [phase-03 Decks](phase-03-decks.md) (the first subject the collaboration subsystem attaches to).

**Implements**
- Feature: [collaboration-core](../features/collaboration-core.md)
- Domain: [playtesting-methodology §5](../domain/playtesting-methodology.md)
- Architecture: [data-model](../architecture/data-model.md#collaboration-polymorphic--see-collaboration-core-spec) · [multi-tenancy](../architecture/multi-tenancy.md) · [api-conventions](../architecture/api-conventions.md) · [frontend](../architecture/frontend.md)

**Scope**
- **Polymorphic `Comment`** (`{ teamId, authorId, subjectType, subjectId, body, parentCommentId?,
  archivedAt? }`) supporting threads via `parentCommentId`.
- **`Mention`** (`{ commentId, mentionedUserId }`) parsed from `@` references in comment bodies; a mention of
  a teammate generates a **`Notification`**.
- **`Notification`** (`{ teamId, userId, type, subjectType, subjectId, readAt? }`) — in-app only, **no email**.
- **`ActivityEvent`** (`{ teamId, actorId, verb, subjectType, subjectId, createdAt }`) — an append-only team
  activity feed.
- A **reusable attach pattern**: a subject-type registry + a small backend contract (declare a
  `subjectType`, resolve/authorize a subject by id within the team) and matching frontend components, so any
  module can add comments + activity without bespoke plumbing.
- **Retrofit onto decks**: decks become the first commentable + activity-tracked subject; creating/updating a
  deck emits activity; commenting/mentioning on a deck works end to end.
- **Frontend**: a `CommentThread` component, a `NotificationCenter`, and an `ActivityFeed`.

**Deliverables**
- **Backend**
  - Prisma models + migration: `Comment`, `Mention`, `Notification`, `ActivityEvent` with composite
    `(teamId, ...)` indexes and indexes on `(subjectType, subjectId)` and `(teamId, userId, readAt)` for the
    notification center.
  - `CollaborationModule` exposing:
    - `GET /api/comments?subjectType=&subjectId=` (threaded), `POST /api/comments`,
      `PATCH /api/comments/:commentId`, `DELETE /api/comments/:commentId` (archive) — all team-scoped, with
      subject resolution + authorization via the attach registry.
    - `GET /api/notifications`, `PATCH /api/notifications/:notificationId/read`,
      `POST /api/notifications/read-all`.
    - `GET /api/activity?subjectType=&subjectId=` (per-subject) and `GET /api/activity` (team feed).
  - A **subject-type registry** (`SubjectType` enum in `packages/shared`) + an `AttachableSubjectResolver`
    interface each owning module implements (resolve a subject by id within the team, authorize read/comment),
    plus a `recordActivity()` / `emitMention()` helper modules call.
  - Mention parsing (extract `@` handles from a comment body, resolve to in-team users, create `Mention` +
    `Notification` rows); a mention of a non-member is ignored (no cross-team leak).
  - Decks integration: register `deck` as an attachable subject; emit `ActivityEvent`s on deck create/update/
    status-change; expose deck comments/activity.
- **Shared** (`packages/shared`): Zod schemas for comment create/update, notification, activity event, the
  `SubjectType` enum, and mention parsing input/output.
- **Frontend** (`apps/web/src/features/collaboration`): `CommentThread` (nested replies, mention
  autocomplete of in-team users), `NotificationCenter` (unread badge, mark read/all read), `ActivityFeed`;
  hooks (`useComments`, `useNotifications`, `useActivity`) with team-scoped query keys. Wire `CommentThread`
  + a deck activity feed into the phase-03 `DeckDetail`.

**Task checklist**
- [ ] Read [collaboration-core](../features/collaboration-core.md), [playtesting-methodology §5](../domain/playtesting-methodology.md), [data-model](../architecture/data-model.md#collaboration-polymorphic--see-collaboration-core-spec), [multi-tenancy](../architecture/multi-tenancy.md).
- [ ] Write Zod schemas + the `SubjectType` enum in `packages/shared` (comment, notification, activity, mention) — test-first.
- [ ] Add Prisma models + migration for `Comment`, `Mention`, `Notification`, `ActivityEvent` with the required indexes; add factories to the two-team harness.
- [ ] Design the **attach pattern**: `AttachableSubjectResolver` interface + registry; `recordActivity()` and `emitMention()` helpers. Write a unit test proving an unregistered/foreign-team subject is rejected.
- [ ] Implement `CollaborationModule` via the phase-01 team-scoped data-access helper. **Write the tenant-isolation test first** (a user in team A cannot read/post comments, see notifications, or read activity for team B; forged ids → 404).
- [ ] Implement comment CRUD + threading (`parentCommentId`), with subject resolution + authorization through the registry; ownership/moderation (author edits own; team-admin moderates). Tests first.
- [ ] Implement mention parsing → `Mention` + `Notification`; test that mentioning an in-team user notifies them and mentioning a non-member/out-of-team user creates **no** notification and leaks nothing.
- [ ] Implement the notification center endpoints (list, mark read, read-all) and per-subject + team activity feeds. Tests first.
- [ ] Retrofit decks: register `deck` as an attachable subject; emit activity on deck create/update/status-change; expose deck comments + activity. Integration test the full attach on a real deck.
- [ ] Build the frontend `CommentThread`, `NotificationCenter`, `ActivityFeed` + hooks; wire into `DeckDetail`; component tests for the thread and mention autocomplete.
- [ ] Update [README.md](README.md) status.

**Tests & verification**
- **Unit (Vitest):** comment/notification/activity Zod schemas; mention parser (extracts handles, ignores
  unknown/out-of-team handles); the attach registry rejects unregistered subject types.
- **Integration (Vitest + test DB):**
  - **Polymorphic attach:** comments + activity work against a deck subject; the same code path would work
    for any registered subject (prove with a second, test-only subject type).
  - **Mention → notification:** commenting with `@teammate` on a deck creates a `Mention` and a
    `Notification` for that user; the notification center lists it and mark-read/read-all work.
  - Comment threading (`parentCommentId`) returns correctly nested threads; author edits own, team-admin moderates.
  - Deck create/update/status-change emits the expected `ActivityEvent`s.
- **Tenant-isolation (mandatory):** a user in team A cannot read or post comments, read notifications, or read
  activity for team B; forged `subjectId`/`X-Team-Id`/`commentId` → 404; a mention cannot notify a user who
  is not a member of the acting team (no cross-team notification).
- **Component (Vitest + Testing Library):** `CommentThread` posts/renders nested replies; mention autocomplete
  lists only in-team users; `NotificationCenter` shows unread count and clears on read.
- **E2E (Playwright):** on a deck, post a comment mentioning a teammate → that teammate sees a notification →
  clicking it opens the deck's comment thread; the deck's activity feed shows the create/comment events.
- **Manual proof:** exercise comment → mention → notification on a deck in the running app across two
  teammates; confirm `pnpm test` (incl. isolation) and `pnpm test:e2e` pass locally (CI runs on push once a remote is configured).

**Out of scope**
- Email/push delivery of notifications — in-app only ([ADR-0003](../decisions/0003-no-email-auth.md)); external delivery is a possible future opt-in.
- Attaching collaboration to subjects other than decks — later phases register their own subjects
  (events phase-05, game logs phase-06, suggestions/testing queue phase-08, primers/decisions/polls in
  [phase-10 Team Knowledge](phase-10-team-knowledge.md)).
- The decisions log, primers, and polls themselves (phase-10) — this phase provides the comment/mention/
  activity substrate they will reuse.
- Real-time push/websockets — polling/refetch is sufficient for now (revisit in [phase-13](phase-13-polish-pwa-hardening.md) if needed).

**See also**
- [collaboration-core](../features/collaboration-core.md) · [playtesting-methodology §5](../domain/playtesting-methodology.md)
- [data-model](../architecture/data-model.md#collaboration-polymorphic--see-collaboration-core-spec) · [multi-tenancy](../architecture/multi-tenancy.md) · [api-conventions](../architecture/api-conventions.md) · [frontend](../architecture/frontend.md)
- Skills: [adding-a-feature-module](../../.claude/skills/adding-a-feature-module/SKILL.md) · [implementing-a-phase](../../.claude/skills/implementing-a-phase/SKILL.md)
- Prev: [phase-03 Decks](phase-03-decks.md) · Next: [phase-05 Events & Gauntlets](phase-05-events-and-gauntlets.md) · Consumed by: [phase-08 Testing Queue](phase-08-testing-queue.md), [phase-10 Team Knowledge](phase-10-team-knowledge.md)
