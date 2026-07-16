import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        // The SPA navigation fallback must NOT swallow backend routes. Without
        // this, Workbox's NavigationRoute serves the precached index.html for
        // every top-level navigation — including the Discord OAuth redirects
        // (`GET /api/discord/callback`, `GET /api/discord/claim/:token/start`),
        // which are real server navigations. That made linking/claiming render
        // the SPA's "Not Found" instead of reaching NestJS. Deny `/api/` so those
        // navigations fall through to the network.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Card art (cross-origin CDN) has a unique URL per card, so it caches
            // safely and gives the biggest offline/perf win. NOTE: intercepting the
            // image here means the SW re-fetches it, which CSP checks against
            // connect-src (not img-src) — the deployed nginx serves /sw.js with a
            // widened connect-src so this fetch isn't blocked (infra/nginx/nginx.conf,
            // docs/architecture/security.md). We deliberately do
            // NOT cache the reference JSON (/api/cards, /api/formats, /api/heroes):
            // those share one URL across teams (the game comes from the X-Team-Id
            // header), so a URL-keyed cache could surface another team's game data
            // — the tenancy rule forbids that. TanStack Query handles that layer
            // and invalidates on team switch.
            urlPattern: ({ request, sameOrigin }) => !sameOrigin && request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "card-images",
              expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        id: "/",
        name: "TeamBrewer",
        short_name: "TeamBrewer",
        description: "Competitive TCG team playtesting and deck selection.",
        categories: ["productivity", "games", "utilities"],
        theme_color: "#1c69e3",
        background_color: "#f7fafe",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      // Bundle the shared package from source (consistent with tests) rather
      // than depending on a prior build of @teambrewer/shared.
      "@teambrewer/shared": resolve(import.meta.dirname, "../../packages/shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    // Proxy API calls to the NestJS server in dev so the SPA stays same-origin
    // (no CORS) and the shared health contract can be exercised end to end.
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
