# Build the NestJS API from the monorepo root (context is the repo root so the
# pnpm workspace and @teambrewer/shared are available). glibc base for the
# widest native-module compatibility during the build.
FROM node:26-bookworm-slim AS build
RUN npm install -g pnpm@11.11.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @teambrewer/shared build \
  && pnpm --filter @teambrewer/api build

FROM node:26-bookworm-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
# Copy the built workspace (source, built dist, and resolved node_modules with
# pnpm's symlink layout intact). Leaner production pruning is a phase-13 concern.
COPY --from=build /repo ./
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
