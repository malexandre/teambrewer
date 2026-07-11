# ADR-0008: Multi-tenant isolated teams (workspaces)

- **Status:** Accepted (2026-07-11)
- **Context:** The user wants to run **multiple isolated teams** on one instance (e.g. a FaB team and a
  Riftbound team). A user may belong to several teams and must **never** see two teams' data at once,
  switching via a selector — like isolated workspaces.

## Decision

- **Team = isolated workspace**, bound to **one game**. Every domain row carries a non-null **`teamId`**.
- **User** is global (one login); **TeamMembership** links user↔team with a per-team role
  (`team_admin` | `member`). A global **instance-admin** creates teams and invites people.
- **Active team** is chosen via a selector; the UI shows exactly one team at a time and never merges data.
- **Isolation is enforced server-side**: the active team is **verified against the user's memberships** on
  every request (never trust a client-supplied id); all queries are `teamId`-scoped; cross-tenant reads
  return 404; cross-team foreign keys are rejected. Covered by mandatory isolation tests.

Design detail: [`../architecture/multi-tenancy.md`](../architecture/multi-tenancy.md). Provisioning model:
instance-admin creates teams + invites; team-admins manage their own team.

## Consequences

- Clean separation for multiple squads/games on one deployment.
- Tenancy is a **security boundary**, so it's built early (phase-01) as a backbone every later feature
  depends on, and it's tested in every module.
- Team-bound-to-one-game keeps each workspace and the card DB simple; multi-game teams are deferred.
- Slightly more complexity in every query and the frontend cache (team-scoped query keys).

## Alternatives considered

- **Single-tenant (one team per instance)** — rejected: user explicitly needs multiple isolated teams.
- **Separate deployment per team** — rejected: more ops overhead; one instance with strict isolation is
  simpler for the user to run.
- **Multi-game teams** — deferred: adds UI/data complexity everywhere; one-game teams match the use case.
