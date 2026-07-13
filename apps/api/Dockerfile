# Build the NestJS API from the monorepo root (context is the repo root so the
# pnpm workspace and @teambrewer/shared are available). glibc base for the
# widest native-module compatibility during the build.
# OpenSSL is required by Prisma's query engine (generate + runtime).
FROM node:26-bookworm-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.11.0
WORKDIR /repo
COPY . .
# The generated Prisma client is .dockerignore'd (never copied from the host), so
# generate it in the image before compiling — otherwise the TS build can't find
# ../generated/prisma. `db:generate` runs `prisma generate` for the API package.
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @teambrewer/api db:generate \
  && pnpm --filter @teambrewer/shared build \
  && pnpm --filter @teambrewer/api build

FROM node:26-bookworm-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
# Prisma's engine needs OpenSSL at runtime too (migrate deploy + queries).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# Copy the built workspace (source, built dist incl. the generated Prisma client,
# and resolved node_modules with pnpm's symlink layout intact).
COPY --from=build /repo ./
EXPOSE 3000
# Apply pending migrations (idempotent, safe to re-run) before starting the
# server, so a fresh `docker compose up` provisions the schema. Prisma reads the
# config + DATABASE_URL from apps/api; `migrate deploy` never generates new
# migrations, only applies committed ones.
CMD ["sh", "-c", "cd apps/api && node_modules/.bin/prisma migrate deploy && cd /repo && exec node apps/api/dist/main.js"]
