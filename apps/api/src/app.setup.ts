import type { INestApplication } from "@nestjs/common";

/**
 * Cross-cutting configuration shared by the real server (main.ts) and tests, so
 * tests exercise the same routing as production. Runtime-only concerns that
 * depend on environment (CORS origin, port) stay in main.ts.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix("api");
}
