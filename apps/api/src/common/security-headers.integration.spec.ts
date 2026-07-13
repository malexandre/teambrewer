import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApiTestApp } from "../../test/nest-app.js";
import { AppModule } from "../app.module.js";

/**
 * The API sets baseline security headers on every response via helmet
 * (security.md, phase-13), independent of the edge headers set by Nginx.
 */
describe("Security headers (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApiTestApp([AppModule]);
  });

  afterAll(async () => {
    await app?.close();
  });

  it("sets the baseline hardening headers on responses", async () => {
    const response = await request(app.getHttpServer()).get("/api/health");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    // The API owns no SPA CSP and no HSTS (those are set at the edge).
    expect(response.headers["content-security-policy"]).toBeUndefined();
    expect(response.headers["strict-transport-security"]).toBeUndefined();
  });
});
