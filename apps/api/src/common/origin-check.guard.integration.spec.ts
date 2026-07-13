import { Controller, Get, type INestApplication, Module, Post } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApiTestApp } from "../../test/nest-app.js";
import { OriginCheckGuard } from "./origin-check.guard.js";

// A minimal always-succeeding route so the test observes the guard in isolation:
// anything that reaches the handler returns 200, so a 403 is unambiguously the
// origin check refusing the request.
@Controller("origin-check-probe")
class OriginCheckProbeController {
  @Post()
  create(): { ok: true } {
    return { ok: true };
  }

  @Get()
  read(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  controllers: [OriginCheckProbeController],
  providers: [{ provide: APP_GUARD, useClass: OriginCheckGuard }],
})
class OriginCheckTestModule {}

const ALLOWED_ORIGIN = "http://localhost:5173";
const SESSION_COOKIE = "better-auth.session_token=abc123";

describe("OriginCheckGuard (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApiTestApp([OriginCheckTestModule]);
  });

  afterAll(async () => {
    await app?.close();
  });

  it("rejects a cookie-authenticated mutation from a foreign origin (403)", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/origin-check-probe")
      .set("Cookie", SESSION_COOKIE)
      .set("Origin", "https://evil.example")
      .send({});
    expect(response.status).toBe(403);
  });

  it("allows a cookie-authenticated mutation from the app origin", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/origin-check-probe")
      .set("Cookie", SESSION_COOKIE)
      .set("Origin", ALLOWED_ORIGIN)
      .send({});
    expect(response.status).toBe(201);
  });

  it("ignores a mutation with no session cookie (auth guards own that)", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/origin-check-probe")
      .set("Origin", "https://evil.example")
      .send({});
    expect(response.status).toBe(201);
  });

  it("does not gate safe (GET) requests on origin", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/origin-check-probe")
      .set("Cookie", SESSION_COOKIE)
      .set("Origin", "https://evil.example");
    expect(response.status).toBe(200);
  });
});
