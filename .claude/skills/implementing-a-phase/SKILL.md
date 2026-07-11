---
name: implementing-a-phase
description: Use when picking up a build phase from docs/plans/ to implement TeamBrewer. Establishes the read-first, test-first, commit-atomically workflow for turning a phase plan into working, tested code.
---

# Implementing a Phase

TeamBrewer is built one phase at a time (see [`docs/plans/`](../../../docs/plans/README.md)). Follow this
every time you implement a phase.

## Before writing any code

1. **Read the phase plan** end to end (e.g. `docs/plans/phase-03-decks.md`). Note its dependencies,
   deliverables, task checklist, and **verification** section.
2. **Read every feature spec it references** in [`docs/features/`](../../../docs/features/).
3. **Read the ADRs and architecture docs it references** ([`docs/decisions/`](../../../docs/decisions/),
   [`docs/architecture/`](../../../docs/architecture/)).
4. **Confirm dependencies are done.** If a prerequisite phase isn't complete, stop and say so.
5. **Create a todo per checklist item** in the phase plan.

## While implementing

- **Work test-first (TDD).** For each unit of behavior: failing test → pass → refactor. Follow
  [`.claude/rules/testing.md`](../../rules/testing.md).
- **Follow the rules:** [coding-standards](../../rules/coding-standards.md),
  [security-and-tenancy](../../rules/security-and-tenancy.md),
  [git-and-commits](../../rules/git-and-commits.md).
- **Team-scope everything** team-owned (verified `teamId` from context; isolation tests). This is a
  security property, not optional.
- **Backend module** = NestJS module (controller/service/Prisma/DTOs). **Frontend feature** = folder under
  `apps/web/src/features/`. Use the [`adding-a-feature-module`](../adding-a-feature-module/SKILL.md) skill.
- **Shared shapes** = Zod schemas in `packages/shared`; infer types from them.
- **Commit often and atomically** with Conventional Commits, keeping the tree green and docs in sync.

## Verifying (before claiming done)

- Run the phase's **verification** steps and the full test suite; paste/point to the evidence. Use the
  superpowers `verification-before-completion` discipline — no green claims without running commands.
- Update `CLAUDE.md` "Commands" and any doc a decision changed, in the same work.
- Mark the phase's status in [`docs/plans/README.md`](../../../docs/plans/README.md).

## If something is unclear or a decision needs to change

- **Ask** rather than assume (project + user preference).
- If implementation reveals a better decision, update the relevant doc/ADR **with** the code change and
  note it in the commit — don't let docs and code drift.
