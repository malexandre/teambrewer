# Local development — `pnpm start`

The fastest way to run TeamBrewer on your machine and click through it by hand. One command boots a
local database, seeds it, bootstraps an admin account, and starts the app with hot reload.

> For the containerised, production-shaped stack (Nginx + built images), see
> [self-hosting.md](self-hosting.md) and `docker-compose.yml`. `pnpm start` is the **development** flow:
> only Postgres runs in Docker; the API and web app run natively so edits reload instantly.

## Prerequisites

- Docker Desktop running (only Postgres runs in a container).
- The pinned toolchain via [mise](https://mise.jdx.dev/) (Node + pnpm — see `mise.toml`).
- `pnpm install` run once.

## Quick start

```bash
pnpm start
```

That runs [`scripts/start-local.mjs`](../../scripts/start-local.mjs), which:

1. **Resolves config** — reads `./.env`, creating it from a template on first run (with a freshly
   generated, persisted `BETTER_AUTH_SECRET`). Real shell environment variables override the file.
2. **Starts Postgres** in Docker (`docker-compose.dev.yml`) and waits until it is healthy.
3. **Builds** `@teambrewer/shared` + `@teambrewer/api` (the seed/bootstrap commands run compiled output).
4. **Applies migrations** (`prisma migrate deploy`).
5. **Seeds reference data** (games + formats — network-free, idempotent).
6. **Syncs the card database** on the **first run only** (downloads the sanctioned open dataset; skipped
   on later runs — set `FORCE_CARD_SYNC=1` to force).
7. **Bootstraps the instance-admin** (identity from `SEED_ADMIN_USERNAME` / `SEED_ADMIN_DISPLAY_NAME`).
8. **Prints a setup link** and starts the web + api dev servers.

Then finish onboarding in the browser:

1. Open the printed **setup link** (`http://localhost:5173/setup/<token>`). It is also saved to
   `.docker-data/last-setup-link.txt`.
2. Set a password and complete **TOTP (2FA) enrolment** — mandatory for password accounts (ADR-0003 /
   ADR-0009). Keep the backup codes.
3. You are signed in as an **instance-admin**. From there, create a team, appoint team-admins, and
   invite members through the admin UI — each invited member gets their own setup link.

Stop everything with `Ctrl-C`. The Postgres container keeps running in the background (data persists), so
the next `pnpm start` is fast. To stop the database too:

```bash
pnpm db:down            # docker compose -f docker-compose.dev.yml down (data is kept)
```

## Data persistence & resetting

The database lives in a **bind mount** at `./.docker-data/postgres` (gitignored). It survives container
stop/removal. To reset to a clean slate:

```bash
pnpm db:down
rm -rf .docker-data          # removes the DB and the first-run card-sync marker
pnpm start                   # re-migrates, re-seeds, re-syncs cards, re-bootstraps
```

## Configuration (`./.env`)

`pnpm start` generates `./.env` on first run. Edit it to change local behaviour; the relevant variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `SEED_ADMIN_USERNAME` | Username of the bootstrapped instance-admin | `admin` |
| `SEED_ADMIN_DISPLAY_NAME` | Display name of that admin | `Local Admin` |
| `DEV_DB_PORT` | Host port for the dev Postgres (5432/5433 are often taken) | `5434` |
| `POSTGRES_PASSWORD` | Dev database password | `teambrewer` |
| `DATABASE_URL` | API → Postgres connection string | `postgresql://teambrewer:teambrewer@localhost:5434/teambrewer` |
| `WEB_ORIGIN` | Dev web origin (Vite); also the base of the setup link | `http://localhost:5173` |
| `BETTER_AUTH_URL` | Better Auth base URL | `http://localhost:5173` |
| `API_PORT` | API listen port (Vite proxies `/api` here) | `3000` |
| `BETTER_AUTH_SECRET` | Better Auth signing secret (generated once, keep stable) | generated |

The bootstrap is **idempotent**: re-running promotes an existing seed user to instance-admin if needed,
reissues a setup link while no password is set, and simply reports "already set up" once a password
exists.

**Any other variable you add to `./.env` is passed through to the API too** — e.g. to enable Discord
login (invitees can then choose password or Discord when they claim their invite), add
`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_REDIRECT_URI` to `./.env` and restart
`pnpm start`.

## Troubleshooting

- **"Docker does not appear to be running"** — start Docker Desktop.
- **Port 5434 already in use** — set `DEV_DB_PORT` (and the matching port in `DATABASE_URL`) in `./.env`.
- **Setup link expired** — setup links last 24h; just re-run `pnpm start` to issue a fresh one.
- **Cards missing in pickers** — run `FORCE_CARD_SYNC=1 pnpm start`, or
  `pnpm --filter @teambrewer/api card:sync` against a running dev DB.
