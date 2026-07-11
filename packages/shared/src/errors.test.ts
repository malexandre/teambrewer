import { describe, expect, it } from "vitest";

import { errorCode, errorEnvelopeSchema } from "./errors.js";

describe("errorEnvelopeSchema", () => {
  it("parses a minimal error envelope", () => {
    const parsed = errorEnvelopeSchema.parse({
      error: { code: "NOT_FOUND", message: "Deck not found" },
    });
    expect(parsed.error.code).toBe("NOT_FOUND");
    expect(parsed.error.details).toBeUndefined();
  });

  it("parses an envelope with structured details", () => {
    const parsed = errorEnvelopeSchema.parse({
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid input",
        details: { fields: { username: "too short" } },
      },
    });
    expect(parsed.error.details).toEqual({ fields: { username: "too short" } });
  });

  it("rejects an envelope missing the code", () => {
    expect(() => errorEnvelopeSchema.parse({ error: { message: "boom" } })).toThrow();
  });

  it("rejects an empty code or message", () => {
    expect(() => errorEnvelopeSchema.parse({ error: { code: "", message: "boom" } })).toThrow();
  });
});

describe("errorCode", () => {
  it("exposes stable machine-readable codes", () => {
    expect(errorCode.tenantForbidden).toBe("TENANT_FORBIDDEN");
    expect(errorCode.lastTeamAdmin).toBe("LAST_TEAM_ADMIN");
  });
});
