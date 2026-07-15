# syntax=docker/dockerfile:1
#
# Unified multi-stage build for the whole monorepo (context is the repo root so
# the pnpm workspace and @teambrewer/shared are available). One Dockerfile with
# two runtime targets — `api` and `web` — so a single `docker compose build`
# computes the shared `base`/`deps` stages once and both apps branch off them.
#
# Layer-caching strategy: dependency manifests are copied and installed BEFORE
# the source (see the `deps` stage), so editing source leaves the install layer
# CACHED and rebuilds skip `pnpm install` entirely. A BuildKit cache mount keeps
# pnpm's content-addressable store between builds, so even a lockfile change only
# downloads the delta. See docs/ops/self-hosting.md.

# ---- base: toolchain shared by the build and the API runtime ----------------
# glibc base (bookworm-slim) for the widest native-module compatibility, and
# OpenSSL for Prisma's query/migration engines (generate, build, and runtime).
FROM node:26-bookworm-slim AS base
# LEFTHOOK=0 makes the root `prepare` script's `lefthook install` a clean no-op:
# there is no .git in the image (it's .dockerignore'd), so wiring git hooks is
# pointless here. Locally, `pnpm install` still wires the hooks as normal.
# PNPM_HOME anchors pnpm's content-addressable store at /pnpm/store, which is
# where the BuildKit cache mounts below persist it across builds.
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm/bin:$PATH" \
    LEFTHOOK=0
# Node's slim image no longer bundles corepack, so install the pinned pnpm via
# npm directly (matches the version in package.json's packageManager field).
RUN npm install -g pnpm@11.11.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# ---- deps: install ONCE from manifests only (the cache-friendly layer) -------
# Copy only the files that affect dependency resolution. This layer's cache key
# ignores source changes, so it stays valid until the lockfile or a package.json
# changes. When a new workspace package is added, copy its package.json here too.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build-api: compile the API and prune to a production deployment ---------
FROM deps AS build-api
COPY . .
# Generate the Prisma client (.dockerignore'd from the host, so it never exists
# until generated here) before compiling — nest build compiles it into
# dist/generated/prisma, which is what the runtime requires.
RUN pnpm --filter @teambrewer/api db:generate \
 && pnpm --filter @teambrewer/shared build \
 && pnpm --filter @teambrewer/api build
# `pnpm deploy` copies the API package (dist incl. the compiled Prisma client,
# prisma/ schema + migrations, package.json) plus a freshly resolved, production
# node_modules (dev deps skipped via --prod; @teambrewer/shared injected).
# --legacy avoids requiring the workspace-wide injectWorkspacePackages setting.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @teambrewer/api --prod --legacy deploy /prod/api

# ---- build-web: compile the static SPA --------------------------------------
FROM deps AS build-web
COPY . .
RUN pnpm --filter @teambrewer/shared build \
 && pnpm --filter @teambrewer/web build

# ---- api runtime: slim, production-only -------------------------------------
FROM base AS api
ENV NODE_ENV=production
COPY --from=build-api /prod/api /prod/api
WORKDIR /prod/api
EXPOSE 3000
# Apply pending migrations (idempotent, safe to re-run) before starting, so a
# fresh `docker compose up` provisions the schema. `migrate deploy` only applies
# committed migrations, never generates new ones. DATABASE_URL comes from the
# container environment (prisma.config.ts falls back to it when no root .env
# exists in the deployed package).
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]

# ---- web runtime: Nginx serving the SPA and reverse-proxying /api -----------
FROM nginx:1.27-alpine AS web
COPY infra/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-web /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
