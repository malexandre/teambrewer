# Self-hosting TeamBrewer

How to run and operate a TeamBrewer instance on your own server. This is the ops
runbook for phase-13; the security rationale lives in
[architecture/security.md](../architecture/security.md).

## The stack

`docker compose up --build` starts three services (see [`docker-compose.yml`](../../docker-compose.yml)):

| Service | Image | Network | Published? |
|---------|-------|---------|------------|
| `postgres` | `postgres:17-alpine` | internal only | **No** — never exposed publicly |
| `api` | built from the root [`Dockerfile`](../../Dockerfile) (`target: api`) | internal only | No |
| `web` | Nginx, built from the root [`Dockerfile`](../../Dockerfile) (`target: web`) | internal + host | **Yes**, on `WEB_PORT` (default 8080) |

Only the `web` (Nginx) service is published. It serves the built SPA and
reverse-proxies `/api` to the API. Postgres and the API stay on the private
Docker network. The API applies pending Prisma migrations on start
(`prisma migrate deploy`, idempotent), so a fresh volume is provisioned
automatically.

Both services build from the single root [`Dockerfile`](../../Dockerfile)
(distinct `target`s), so one `docker compose build` shares the dependency
install and the `@teambrewer/shared` build between them. Dependency manifests
are installed before source is copied, so **a code-only change rebuilds without
reinstalling dependencies** — subsequent builds are much faster. This relies on
**BuildKit** (default in Docker 23+/Compose v2) for the `# syntax` directive and
the pnpm-store cache mount; on older Docker, export `DOCKER_BUILDKIT=1`. The API
runtime image is pruned to production dependencies (`pnpm deploy --prod`), so it
carries no source tree or dev tooling.

## Deploy from pre-built images (GHCR)

Building on the server is slow and memory-hungry. On a small/throttled VPS,
**pull pre-built images instead of building**. The
[`.github/workflows/publish-images.yml`](../../.github/workflows/publish-images.yml)
workflow publishes both runtime images to GitHub Container Registry on every
release tag (and a rolling tag on `main`):

| Image | Dockerfile target |
|-------|-------------------|
| `ghcr.io/malexandre/teambrewer-api` | `api` |
| `ghcr.io/malexandre/teambrewer-web` | `web` |

**Tag scheme.** A release tag `vX.Y.Z` publishes `X.Y.Z`, `X.Y`, and `latest`; a
push to `main` publishes `main` + `edge` (never `latest`); every build also gets
a `sha-<commit>` tag. **Pin production to an exact `X.Y.Z`** — `latest` only ever
points at the most recent real release, and `edge`/`main` track unreleased work.

The images are **public**, so no registry login is needed to pull. They are
**host-agnostic**: nothing host-specific is baked in at build time (the SPA calls
`/api` same-origin; the API reads all config from the environment), so the *same*
image runs on any host. Supply all configuration at runtime exactly as below.

To consume them, point the `api` and `web` services at the published images
instead of `build:` (the API still applies migrations on boot as usual). For
example, an override that replaces the two `build:` blocks:

```yaml
# docker-compose.ghcr.yml — docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull \
#                            && docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
services:
  api:
    image: ghcr.io/malexandre/teambrewer-api:X.Y.Z # pin a real release
    pull_policy: always
  web:
    image: ghcr.io/malexandre/teambrewer-web:X.Y.Z
    pull_policy: always
```

The runtime `.env` (below) is unchanged — it is the single source of all
host-specific configuration whether you build or pull.

> If the packages are ever switched to **private**, the box needs a one-time
> `docker login ghcr.io -u <github-user>` with a Personal Access Token that has
> the `read:packages` scope before it can pull.

## 1. Configuration (`.env`)

Copy [`.env.example`](../../.env.example) to `.env` and edit. The essentials:

- **`POSTGRES_PASSWORD`** — the database password (used to compose the API's
  `DATABASE_URL`).
- **`BETTER_AUTH_SECRET`** — **required**; the API refuses to start without it.
  Generate one with `openssl rand -base64 32`.
- **`WEB_ORIGIN`** and **`BETTER_AUTH_URL`** — set both to your **public HTTPS
  origin** (e.g. `https://teambrewer.example`). `WEB_ORIGIN` locks CORS and the
  CSRF origin check; `BETTER_AUTH_URL` is where Better Auth issues cookies.
- **`WEB_PORT`** — the host port the front proxy will point at (default 8080).
- **Discord SSO** (`DISCORD_*`) — optional; leave blank to disable.
- **Rate limits** (`RATE_LIMIT_*`) — optional overrides; sensible defaults apply.

`.env` is git-ignored and holds secrets — protect it (`chmod 600`).

## 2. TLS via your front proxy

TeamBrewer's own Nginx listens on plain HTTP on `WEB_PORT` and is designed to sit
**behind a TLS-terminating reverse proxy** (Caddy / Traefik / nginx-proxy-manager)
that you already run on the host. That front proxy owns HTTPS certificates
(Let's Encrypt) and **HSTS**; TeamBrewer's Nginx sets the other security headers
(CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`).

Point DNS (`A`/`AAAA`) for your domain at the VPS first, then configure the proxy
to forward to `http://127.0.0.1:${WEB_PORT}` and **set `X-Forwarded-Proto https`**
(TeamBrewer trusts the proxy chain to detect HTTPS for secure cookies).

**Caddy** (`Caddyfile`) — obtains + renews certs automatically and sends HSTS:

```
teambrewer.example {
  reverse_proxy 127.0.0.1:8080 {
    header_up X-Forwarded-Proto https
  }
  header Strict-Transport-Security "max-age=31536000; includeSubDomains"
}
```

**Traefik** (labels / dynamic config) — router with a Let's Encrypt resolver and
an HSTS headers middleware, forwarding to the web service on port 80. Traefik
sets `X-Forwarded-Proto` from the TLS listener automatically.

**nginx-proxy-manager** — add a Proxy Host for the domain → `web:80` (or the host
IP:`WEB_PORT`), enable "Force SSL" + "HSTS Enabled" and request a Let's Encrypt
cert in the SSL tab. It forwards `X-Forwarded-Proto` by default.

After enabling TLS, set `WEB_ORIGIN` and `BETTER_AUTH_URL` to the `https://` URL
and restart the stack.

## 3. Least-privilege database user (recommended)

By default the API connects as the Postgres superuser `teambrewer` (composed into
`DATABASE_URL` in `docker-compose.yml`). Migrations need DDL privileges, but the
running app only needs DML. To run the app with least privilege, use a **two-role
split**: keep the superuser for migrations, and create a restricted role for the
running app.

Connect as the superuser and create the app role once:

```sql
CREATE ROLE teambrewer_app WITH LOGIN PASSWORD 'choose-a-strong-password';
GRANT CONNECT ON DATABASE teambrewer TO teambrewer_app;
GRANT USAGE ON SCHEMA public TO teambrewer_app;
-- DML on all current and future tables/sequences (migrations still run as the
-- superuser/owner, which continues to own the schema objects):
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO teambrewer_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO teambrewer_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO teambrewer_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO teambrewer_app;
```

Then keep migrations running as the superuser (the API's boot `migrate deploy`),
but override the **runtime** connection to use `teambrewer_app`. The simplest safe
approach: let the container boot-migrate as the superuser, and point the app's
runtime queries at the restricted role by overriding `DATABASE_URL` for the api
service to `postgresql://teambrewer_app:...@postgres:5432/teambrewer`. Because
`migrate deploy` and the app share one `DATABASE_URL` today, adopting the split
means running migrations as a separate step (`docker compose run --rm -e
DATABASE_URL=<superuser-url> api sh -c 'cd apps/api && node_modules/.bin/prisma
migrate deploy'`) and then starting the app with the restricted URL. Do this only
if you want the extra hardening; the default single-role setup is fully functional.

## 4. Backup & restore (PostgreSQL)

Backups contain **all tenants' data** — treat them as sensitive: encrypt at rest,
restrict access, and store off-box.

**Back up** (logical dump of the whole database, compressed custom format):

```bash
docker compose exec -T postgres \
  pg_dump -U teambrewer -d teambrewer -Fc \
  > "teambrewer-$(date +%Y%m%d-%H%M%S).dump"
```

**Restore** into a fresh database (verify the procedure periodically):

```bash
# Into the running stack's Postgres (drops and recreates objects):
docker compose exec -T postgres \
  pg_restore -U teambrewer -d teambrewer --clean --if-exists < your-backup.dump
```

To rehearse a restore safely, create a scratch database and restore into it:

```bash
docker compose exec -T postgres createdb -U teambrewer teambrewer_restore_check
docker compose exec -T postgres \
  pg_restore -U teambrewer -d teambrewer_restore_check < your-backup.dump
docker compose exec -T postgres \
  psql -U teambrewer -d teambrewer_restore_check -c '\dt' # confirm tables/data
docker compose exec -T postgres dropdb -U teambrewer teambrewer_restore_check
```

Automate a nightly `pg_dump` via cron on the host and rotate/retain per your
policy. Because Postgres is not published, run these through `docker compose exec`.

## See also

- [architecture/security.md](../architecture/security.md) — headers, CSRF, rate limiting, tenant isolation.
- [architecture/overview.md](../architecture/overview.md) — the stack at a glance.
- [`.env.example`](../../.env.example) · [`apps/api/.env.example`](../../apps/api/.env.example) — every config var.
