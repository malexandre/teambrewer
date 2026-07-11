import { describe, expect, it } from "vitest";

import { healthResponseSchema, type HealthResponse } from "./health.js";

describe("healthResponseSchema", () => {
  it("parses a valid health payload", () => {
    const parsed: HealthResponse = healthResponseSchema.parse({ status: "ok" });
    expect(parsed).toEqual({ status: "ok" });
  });

  it("rejects an unexpected status value", () => {
    expect(() => healthResponseSchema.parse({ status: "degraded" })).toThrow();
  });

  it("rejects a payload missing the status field", () => {
    expect(() => healthResponseSchema.parse({})).toThrow();
  });
});
