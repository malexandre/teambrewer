import type { INestApplication } from "@nestjs/common";
import helmet from "helmet";

/**
 * Cross-cutting configuration shared by the real server (main.ts) and tests, so
 * tests exercise the same routing and hardening as production. Runtime-only
 * concerns that depend on environment (CORS origin, port, trust-proxy) stay in
 * main.ts.
 */
export function configureApp(app: INestApplication): void {
  // Security headers on every response (security.md, phase-13), as defense in
  // depth alongside the edge headers set by Nginx. Applied first so it also
  // covers Better Auth's routes. The SPA's Content-Security-Policy is owned by
  // the edge (this API serves JSON only), and HSTS is emitted by the
  // TLS-terminating front proxy — so both are disabled here to avoid drift.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      strictTransportSecurity: false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      xFrameOptions: { action: "deny" },
    }),
  );

  app.setGlobalPrefix("api");
}
