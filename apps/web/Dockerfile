# Build the static SPA from the monorepo root, then serve it with Nginx, which
# also reverse-proxies /api to the API service.
FROM node:26-bookworm-slim AS build
RUN npm install -g pnpm@11.11.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @teambrewer/shared build \
  && pnpm --filter @teambrewer/web build

FROM nginx:1.27-alpine AS runtime
COPY infra/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
