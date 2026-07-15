# TeamBrewer — Knowledge Base

TeamBrewer is a private, invite-only web app that helps a competitive **Trading Card Game (TCG)
team** work together to "crack the meta" and choose the best decks for each important tournament.

This `docs/` folder is the **single source of truth** for what TeamBrewer is, why each decision was
made, and how it should be built. It is written to be consumed by both humans and future AI agent
sessions. **Read the relevant documents here before implementing anything.**

> Status: the app is built (a shippable, self-hostable v1) and has since been re-centred on the
> **metagame** — see the "meta-pivot" summary in [`../CLAUDE.md`](../CLAUDE.md) and
> [ADR-0010](decisions/0010-meta-as-organizing-hub.md). Some phase-era feature specs and plans under
> [`plans/`](plans/README.md) still describe the original event-centric build; treat `CLAUDE.md` +
> the ADRs as authoritative where they differ.

## How this knowledge base is organized

| Folder | What's in it | Read it when… |
|---|---|---|
| [`product/`](product/) | Vision, glossary, personas & use cases, the full feature catalog | You need to understand *what* we're building and *for whom* |
| [`domain/`](domain/) | Flesh and Blood & Riftbound domain knowledge, card-data sources, playtesting methodology | You need TCG subject-matter knowledge |
| [`features/`](features/) | One spec per feature module (purpose, user stories, rules, edge cases) | You're implementing or changing a feature |
| [`architecture/`](architecture/) | Tech stack, data model, multi-tenancy, API conventions, security, frontend, testing, game abstraction | You're making a technical decision |
| [`decisions/`](decisions/) | Architecture Decision Records (ADRs) — the *why* behind the big calls | You want the rationale or are tempted to reverse a decision |
| [`ops/`](ops/self-hosting.md) | Self-hosting runbook — deploy, TLS via a front proxy, env config, DB backup/restore | You're deploying or operating an instance |
| [`plans/`](plans/README.md) | The modular, multi-session implementation roadmap | You're about to build a phase |

## The 60-second summary

- **Who:** competitive TCG teams of ~10–30 people. **Primary game: Flesh and Blood.** Riftbound is
  designed-for but built later. See [`domain/flesh-and-blood.md`](domain/flesh-and-blood.md).
- **Isolated teams (workspaces):** one instance hosts many teams; a team never sees another team's
  data. See [`architecture/multi-tenancy.md`](architecture/multi-tenancy.md).
- **Meta-centric:** the team's organizing unit is a dated **Meta** (a tiered list of decks to beat);
  readiness, testing, and events all hang off it. Events are lightweight (name/date/RSVP). See
  [`features/metas.md`](features/metas.md) and [ADR-0010](decisions/0010-meta-as-organizing-hub.md).
- **Decks are links, not lists:** a deck is `{ hero, format, external link, metadata }`. The app is a
  collaboration layer over decks-as-links, powered by a rich card database — **not** a deck builder or
  a scraper. See [ADR-0002](decisions/0002-decks-as-links.md).
- **The signature feature is confidence:** every logged game carries structured confidence factors, and
  matchup win rates are **confidence-weighted with the sample size always shown**. See
  [`features/confidence-and-matchups.md`](features/confidence-and-matchups.md).
- **Invite-only, no email:** admins hand out copy-paste links. Each account logs in with **either Discord
  SSO or password + mandatory TOTP 2FA** (password + TOTP, optionally plus Discord login — ADR-0011). See
  [`architecture/security.md`](architecture/security.md), [ADR-0009](decisions/0009-discord-authentication.md),
  and [ADR-0011](decisions/0011-discord-additional-login-method.md).
- **Stack:** React + Vite (PWA) · NestJS · PostgreSQL + Prisma · Better Auth · pnpm monorepo · Docker
  Compose · self-hosted. See [`architecture/tech-stack.md`](architecture/tech-stack.md).

## Working agreement for contributors (human or agent)

1. **Read before you build.** Open the feature spec + the referenced ADRs + the phase plan first.
2. **Follow the rules** in [`../.claude/rules/`](../.claude/rules/) and [`../CLAUDE.md`](../CLAUDE.md).
3. **Test-first, well-tested.** See [`architecture/testing-strategy.md`](architecture/testing-strategy.md).
4. **Commit often and atomically** with Conventional Commits.
5. **When something is unclear, ask** — do not assume. Keep the docs the source of truth: if a decision
   changes, update the doc and add/adjust an ADR in the same change.
