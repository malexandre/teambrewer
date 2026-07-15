# TeamBrewer

> _Personal note: beyond solving a real need for my team, this project is also my experiment in **pure
> vibe coding** — building an app I genuinely need, driven end-to-end through AI-assisted development._

A private, invite-only, self-hostable web app that helps a competitive **Trading Card Game team** work
together to crack the metagame and pick the best decks for each important tournament. Primary game:
**Flesh and Blood** — the game-adapter architecture is built for more (a Riftbound card adapter already
exists). One instance hosts **multiple isolated teams (workspaces)** that never see each other's data.

## What it does

The app centres on the **metagame**, with a primary loop of **decks ↔ metas ↔ tasks**:

- **Decks** are link-only (Fabrary, etc.) over a global, per-game **card database** — TeamBrewer is not a
  deck builder ([ADR-0002](docs/decisions/0002-decks-as-links.md)).
- **Metas** are the organizing hub: a dated window for a format owning a tiered list of **decks to beat**.
  Decks link to metas, and a deck's build of a meta entry feeds that matchup's readiness.
- **Confidence-weighted game logging** records results with the factors that make them trustworthy
  (sample size always shown), and feeds each deck's **Readiness** view — weighted win rate, raw sample,
  thin-data flags, and whether a matchup has a game-plan.
- **Matchup game-plans** and **tasks** capture shared testing knowledge, with cards referenced inline as
  `+card` mentions and teammates as `@mentions` (→ notifications + activity feed).
- **Lightweight events** with RSVP, and everything wrapped in **strict per-team isolation**, password +
  mandatory TOTP (or Discord SSO) auth, and an offline-capable **PWA**.

The knowledge base in [`docs/`](docs/README.md) is the source of truth for the product, domain,
architecture, and decisions.

## Stack

TypeScript (strict) · React + Vite (PWA) · NestJS · PostgreSQL + Prisma · Better Auth (invite-only, TOTP
2FA / Discord SSO) · Zod · pnpm monorepo · Vitest + Testcontainers + Playwright · Docker Compose ·
self-hosted. See [`docs/architecture/tech-stack.md`](docs/architecture/tech-stack.md).

## Run it locally

Prerequisites: Docker, and the toolchain pinned in [`mise.toml`](mise.toml) (Node + pnpm).

```sh
pnpm install
pnpm start   # boots a local Postgres in Docker, migrates + seeds, syncs cards, bootstraps an
             # instance-admin, prints that admin's setup link, and runs web + api in watch mode
```

Open the printed setup link to create the first admin (setup → TOTP → app). For the full self-hosted
stack behind Nginx, use `docker compose up --build`. More detail:
[`docs/ops/local-development.md`](docs/ops/local-development.md).

## Repository map

- **[`docs/`](docs/README.md)** — the knowledge base and single source of truth (vision, domain,
  features, architecture, decisions).
- **[`CLAUDE.md`](CLAUDE.md)** — how to work in this repository (for humans and AI agents).
- **[`.claude/`](.claude/)** — coding rules, project skills, and settings.
- **[`docs/plans/`](docs/plans/README.md)** — the phase-by-phase implementation history.

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
