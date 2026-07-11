import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApiTestApp } from "../../test/nest-app.js";
import { AppModule } from "../app.module.js";

describe("Rate limiting (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApiTestApp([AppModule]);
  });

  afterAll(async () => {
    await app?.close();
  });

  it("throttles repeated hits to a sensitive endpoint (429 RATE_LIMITED)", async () => {
    // The strict limit is 20/min. Bogus tokens still count toward the limit
    // (throttling happens before the handler), so the 21st attempt is refused.
    let lastStatus = 0;
    let lastBody: { error?: { code?: string } } = {};
    for (let attempt = 0; attempt < 21; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post("/api/onboarding/setup/bogus-token")
        .send({ password: "a-strong-passphrase-01" });
      lastStatus = response.status;
      lastBody = response.body;
    }

    expect(lastStatus).toBe(429);
    expect(lastBody.error?.code).toBe("RATE_LIMITED");
  });
});
