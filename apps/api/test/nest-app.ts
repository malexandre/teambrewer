import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  type ModuleMetadata,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import type { NextFunction, Request, Response } from "express";
import { inject } from "vitest";

import { configureApp } from "../src/app.setup.js";
import type { RequestWithTenantContext } from "../src/tenancy/team-context.js";

/**
 * Drives the caller identity in HTTP tests from headers instead of a real Better
 * Auth session, so a test can act as any user:
 *
 * - `x-test-user-id`        -> sets `request.userId`
 * - `x-test-instance-admin` -> `"true"` sets `request.isInstanceAdmin`
 *
 * Registered as an additional global guard alongside the real AuthenticationGuard
 * (which, finding no session cookie, attaches nothing and never clears what this
 * guard set). The real guard is covered by its own integration test; endpoint
 * tests focus on authorization (RoleGuard / TeamAdminGuard) and behavior.
 */
export class HeaderAuthenticationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithTenantContext>();
    const header = request.headers["x-test-user-id"];
    const userId = Array.isArray(header) ? header[0] : header;
    if (userId) {
      request.userId = userId;
      request.isInstanceAdmin = request.headers["x-test-instance-admin"] === "true";
    }
    return true;
  }
}

/** Set the test-caller headers on a supertest request. */
export function asUser(
  request: { set(field: string, value: string): typeof request },
  options: { userId: string; isInstanceAdmin?: boolean },
): typeof request {
  request.set("x-test-user-id", options.userId);
  if (options.isInstanceAdmin) {
    request.set("x-test-instance-admin", "true");
  }
  return request;
}

/**
 * Build and initialise a Nest application for HTTP integration tests, pointing
 * PrismaService at the ephemeral Testcontainers database and adding the
 * header-driven authentication guard.
 */
export async function createApiTestApp(
  imports: NonNullable<ModuleMetadata["imports"]>,
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<INestApplication> {
  // PrismaService and Better Auth read these at construction; the DB URL is
  // provided per-worker by the global setup (env does not cross the worker
  // boundary, so set it from inject()).
  process.env["DATABASE_URL"] = inject("databaseUrl");
  process.env["BETTER_AUTH_SECRET"] ??= "test-better-auth-secret-please-change-0123456789";
  process.env["BETTER_AUTH_URL"] ??= "http://localhost:3000";

  // `configure` lets a test override providers (e.g. stub a network client with
  // a fixture) so the suite stays deterministic and never hits the network.
  const builder = Test.createTestingModule({
    imports,
    providers: [{ provide: APP_GUARD, useClass: HeaderAuthenticationGuard }],
  });
  const moduleRef = await (configure ? configure(builder) : builder).compile();

  const app = moduleRef.createNestApplication();
  // Force `Connection: close` on every test response so supertest never reuses a
  // keep-alive socket. The harness hands one persistent server to every request(),
  // and superagent's default agent reuses sockets across sequential requests — under
  // parallel load the server may have closed a reused one, which surfaces client-side
  // as "Parse Error: Expected HTTP/, RTSP/ or ICE/". Test-only; production is unaffected.
  // This is only a partial mitigation — see the `retry` note in vitest.config.ts.
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader("Connection", "close");
    next();
  });
  configureApp(app);
  await app.init();
  return app;
}
