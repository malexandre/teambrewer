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
      manifest: {
        name: "TeamBrewer",
        short_name: "TeamBrewer",
        description: "Competitive TCG team playtesting and deck selection.",
        theme_color: "#0b0b0c",
        background_color: "#0b0b0c",
        display: "standalone",
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
