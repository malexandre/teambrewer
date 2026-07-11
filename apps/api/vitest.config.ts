import { resolve } from "node:path";

import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite 8's built-in transformer is Oxc; disable it so SWC (below) is the sole
  // transform and emits the decorator metadata NestJS needs.
  oxc: false,
  plugins: [
    // NestJS relies on emitted decorator metadata (reflect-metadata) for DI.
    // Vitest's default esbuild transform does not emit it, so transform test
    // files with SWC's legacy-decorator + decorator-metadata support instead.
    swc.vite({
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  resolve: {
    alias: {
      // Use the shared package's TypeScript source in tests so they never
      // depend on a prior `pnpm --filter shared build`. Runtime (nest build /
      // node dist) still resolves the built package via the workspace symlink.
      "@teambrewer/shared": resolve(import.meta.dirname, "../../packages/shared/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    // Load the reflect-metadata polyfill once so NestJS decorator metadata is
    // available during tests, mirroring the import in main.ts.
    setupFiles: ["reflect-metadata"],
    // Provisions an ephemeral Postgres via Testcontainers and applies the
    // migrations once for the whole run (see test/global-setup.ts).
    globalSetup: ["./test/global-setup.ts"],
    // A single Postgres container is shared across the run; keep DB-touching
    // suites from racing each other on shared tables.
    fileParallelism: false,
    // Starting the container + applying migrations can exceed the default hook
    // timeout on a cold Docker image pull.
    hookTimeout: 120_000,
  },
});
