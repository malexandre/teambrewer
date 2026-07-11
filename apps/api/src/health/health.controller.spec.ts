import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { healthResponseSchema } from "@teambrewer/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { configureApp } from "../app.setup.js";
import { HealthController } from "./health.controller.js";

describe("HealthController (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/health returns 200 with a schema-valid body", async () => {
    const response = await request(app.getHttpServer()).get("/api/health");

    expect(response.status).toBe(200);
    // The response must satisfy the shared contract, proving the single
    // source of truth flows from packages/shared through the API.
    expect(healthResponseSchema.parse(response.body)).toEqual({ status: "ok" });
  });

  it("is mounted under the global /api prefix, not the bare path", async () => {
    const response = await request(app.getHttpServer()).get("/health");
    expect(response.status).toBe(404);
  });
});
