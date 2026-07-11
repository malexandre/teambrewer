# Feature: Teams & Membership

## Summary

A **Team** is an isolated workspace bound to exactly one game; a **TeamMembership** links a user to a team
with a per-team role (`team_admin` | `member`). Instance-admins create teams and invite people; team-admins
manage their own team. A user may belong to several teams and switches between them with an **active-team
selector** — the UI shows one team at a time and never merges data. See
[ADR-0008](../decisions/0008-multi-tenant-teams.md) and [multi-tenancy](../architecture/multi-tenancy.md).

## Goals & value

- Run **multiple isolated squads/games** on one self-hosted instance without data ever bleeding across
  teams — the core tenancy promise ([ADR-0008](../decisions/0008-multi-tenant-teams.md)).
- Bind each team to **one game** so the workspace and its card DB stay simple.
- Give team-admins self-service control of their own membership without needing the instance-admin.
- Let multi-team users move cleanly between workspaces.

## User stories

- As an **instance-admin**, I can create a team, choose its game, and appoint its first team-admin.
- As an **instance-admin**, I can delete/archive a team.
- As a **team-admin**, I can invite a new member to my team (create account + membership; see
  [accounts-and-auth](accounts-and-auth.md)) and set their role.
- As a **team-admin**, I can promote a member to team-admin, demote, or **remove** a member.
- As a **member**, I can see the teams I belong to and switch my **active team**.
- As a **member of one team**, I never see any other team's data.

## Data

Uses tenancy entities from [data-model](../architecture/data-model.md#identity--tenancy):

- **Team** `{ id, name, slug, gameId (→ Game), createdBy, ... }` — bound to exactly one game.
- **TeamMembership** `{ id, teamId, userId, role: 'team_admin' | 'member', joinedAt }` — unique on
  `(teamId, userId)`.
- **User** — global (one login, many teams); `isInstanceAdmin` is a global flag.
- **Active team** — not stored as domain data; resolved per-request from the client's team indicator,
  verified against the user's memberships (see [multi-tenancy](../architecture/multi-tenancy.md)).

`Team` and `TeamMembership` are the tenant root/link — see
[data-model](../architecture/data-model.md#global-vs-team-scoped).

## Behavior & rules

- A team is **created only by an instance-admin**, who picks the `gameId` at creation (the game is fixed for
  the team's life; multi-game teams are deferred per [ADR-0008](../decisions/0008-multi-tenant-teams.md)).
- Membership is created when an admin invites a user; the invited user completes onboarding via a setup link
  ([accounts-and-auth](accounts-and-auth.md)).
- A team must always retain **at least one team-admin**; the last team-admin cannot be demoted or removed
  until another is appointed (an instance-admin can still act).
- Removing a member ends their access to that team; their **authored content is preserved** (soft-delete
  rules per [data-model](../architecture/data-model.md), ownership stays attributed).
- Deleting/archiving a team is an instance-admin action and cascades within that team only.

### Capability matrix (per role)

The authoritative table lives in
[multi-tenancy](../architecture/multi-tenancy.md#roles--capabilities). This module owns these rows:

| Capability | Instance-admin | Team-admin | Member |
|---|---|---|---|
| Create / delete teams | ✅ | ❌ | ❌ |
| Choose a team's game | ✅ (at creation) | ❌ | ❌ |
| Invite / remove members (own team) | ✅ | ✅ | ❌ |
| Change a member's role (own team) | ✅ | ✅ | ❌ |
| Switch active team | ✅ | ✅ | ✅ (among own memberships) |

## API surface

Per [api-conventions](../architecture/api-conventions.md); `teamId` from verified context, never the body:

- `POST /api/admin/teams` — create team (instance-admin) `{ name, gameId, firstAdminUserId? }`.
- `GET /api/admin/teams` / `DELETE /api/admin/teams/:teamId` — list / archive (instance-admin).
- `GET /api/me/teams` — the teams the authenticated user belongs to (drives the selector).
- `GET /api/teams/:teamId/members` — list members (any member of that team).
- `POST /api/teams/:teamId/members` — invite/add a member with a role (team-admin/instance-admin).
- `PATCH /api/teams/:teamId/members/:userId` — change role (team-admin/instance-admin).
- `DELETE /api/teams/:teamId/members/:userId` — remove member (team-admin/instance-admin).

The active-team indicator (header `X-Team-Id` or path prefix — one convention chosen in phase-01) is
verified by `TeamContextGuard` on every scoped request.

## UI / UX

Mobile-first (see [frontend](../architecture/frontend.md#active-team-context-critical)):

- **Active-team selector** in the app shell, listing only the user's teams; switching **invalidates
  team-scoped TanStack Query caches** and reloads. Single-team users see it collapsed/implicit.
- **Team members screen** (admin): list with roles, invite (opens the account-creation + copy-link flow),
  change role, remove — with the last-admin guard surfaced inline.
- **Instance admin screen:** create team (name + game), list/archive teams.
- The UI renders exactly one team's data at a time; the active team's **game** drives which reference data
  (cards/formats/heroes) and labels appear.

## Tenancy & permissions

This feature **is** the tenancy backbone. All later modules depend on the verified `{ userId, teamId, role }`
context established here; the mechanism (guard, session-trusted team, `teamId` stamping) is defined in
[multi-tenancy](../architecture/multi-tenancy.md) — not re-explained per feature. Team-admin powers are
scoped to their own team; instance-admin is global. Reference data is **game-filtered** by the active team's
`gameId`, not `teamId`-scoped.

## Edge cases

- User belongs to **no** team -> a neutral "ask an admin to add you to a team" state; no scoped data.
- Attempt to switch to a team the user doesn't belong to (forged indicator) -> 403 (isolation).
- Removing the **last team-admin** -> blocked (422) with a clear message.
- Removing yourself -> allowed for members; team-admins blocked if last admin.
- A removed user still holds a session -> subsequent scoped requests for that team return 403.
- Cross-team foreign key (e.g. adding a member reference from another team) -> rejected.

## Testing notes

Per [testing-strategy](../architecture/testing-strategy.md):

- **Tenant isolation (mandatory):** a user in team A cannot read/write team B's rows even with a forged
  `teamId` (403); `GET /api/me/teams` returns only the user's memberships; frontend query keys are
  team-scoped and switching teams shows only that team's data (e2e).
- **Integration:** team creation stamps `gameId`; membership unique on `(teamId, userId)`; role changes;
  last-admin guard; member removal preserves authored content.
- **AuthZ:** member cannot invite/change roles/delete team (403); team-admin cannot act on another team
  (403); only instance-admin creates/deletes teams.

## Out of scope

- **Multi-game teams** — deferred ([ADR-0008](../decisions/0008-multi-tenant-teams.md)).
- **Public / open signup and self-join** — cut
  ([feature-catalog](../product/feature-catalog.md#explicitly-cut-out-of-scope)); membership is
  admin-granted.
- Account creation, setup/reset links, and 2FA mechanics -> [accounts-and-auth](accounts-and-auth.md).

## See also

- [ADR-0008: Multi-tenant isolated teams](../decisions/0008-multi-tenant-teams.md)
- [Multi-tenancy](../architecture/multi-tenancy.md) · [Data model](../architecture/data-model.md) ·
  [API conventions](../architecture/api-conventions.md) · [Frontend](../architecture/frontend.md)
- [Accounts & auth](accounts-and-auth.md)
- Implementing phase: [phase-01 Auth & Tenancy](../plans/phase-01-auth-and-tenancy.md)
