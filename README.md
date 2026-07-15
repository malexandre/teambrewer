# TeamBrewer

> _Personal note: beyond solving a real need for my team, this project is also my experiment in **pure
> vibe coding** — building an app I genuinely need, driven end-to-end through AI-assisted development._

A private, invite-only web app that helps a competitive **Trading Card Game team** work together to
crack the meta and choose the best decks for each important tournament. Primary game: **Flesh and Blood**
(Riftbound designed-for, built later). One instance hosts **multiple isolated teams (workspaces)**.

> **Status:** building phase by phase. **Phase-00 (foundation)** and **phase-01 (auth & tenancy)** are
> done: the monorepo, the NestJS API + React PWA, invite-only password+TOTP / Discord authentication, and
> server-enforced multi-team isolation, all locally green (unit, integration, and e2e). See
> [`docs/plans/`](docs/plans/README.md) for the roadmap and current status.

## Start here

- **[`docs/`](docs/README.md)** — the knowledge base and single source of truth (vision, domain,
  features, architecture, decisions).
- **[`docs/plans/`](docs/plans/README.md)** — the modular, multi-session implementation roadmap.
- **[`CLAUDE.md`](CLAUDE.md)** — how to work in this repository (for humans and AI agents).
- **[`.claude/`](.claude/)** — coding rules, project skills, and settings.

## What it does (planned)

Structured, trustworthy, shared testing knowledge organized around tournaments: link-only decks over a
rich card database, **confidence-weighted** game logging and matchup matrices (sample size always shown),
event gauntlets with expected-metagame weighting and coverage tracking, per-deck tech suggestions,
matchup game-plans, primers, and team collaboration — all inside isolated per-team workspaces.

## Planned stack

TypeScript · React + Vite (PWA) · NestJS · PostgreSQL + Prisma · Better Auth (invite-only, TOTP 2FA) ·
Zod · pnpm monorepo · Docker Compose · self-hosted. See [`docs/architecture/tech-stack.md`](docs/architecture/tech-stack.md).

## License / attribution

TeamBrewer is free software licensed under the **GNU Affero General Public License v3.0**
(`AGPL-3.0-only`) — see [`LICENSE`](LICENSE). Because it is network-served, anyone who runs a modified
version as a service must make their source available to its users (AGPL §13).

Card data is sourced from sanctioned open datasets (e.g.
[the-fab-cube/flesh-and-blood-cards](https://github.com/the-fab-cube/flesh-and-blood-cards)) and synced at
runtime into each deployment's own database — none of it is redistributed in this repository. Card names,
text, and artwork remain the intellectual property of their respective owners (Legend Story Studios for
Flesh and Blood; Riot Games for Riftbound). TeamBrewer is an unofficial fan tool, not affiliated with,
endorsed by, or sponsored by either. Full attribution is in [`NOTICE`](NOTICE) and surfaced in-app.
