import { describe, expect, it } from "vitest";

import { createRetrospectiveSchema, updateRetrospectiveSchema } from "./retrospectives.js";

describe("createRetrospectiveSchema", () => {
  it("accepts a body with optional sections", () => {
    const parsed = createRetrospectiveSchema.parse({
      body: "We went 5-2; the aggro plan held up.",
      resultsSummary: "3rd of 32",
      learnings: "Bring more interaction vs Briar.",
    });
    expect(parsed.body).toContain("5-2");
    expect(parsed.resultsSummary).toBe("3rd of 32");
    expect(parsed.learnings).toBe("Bring more interaction vs Briar.");
  });

  it("defaults the optional sections to empty strings", () => {
    const parsed = createRetrospectiveSchema.parse({ body: "Solid event." });
    expect(parsed.resultsSummary).toBe("");
    expect(parsed.learnings).toBe("");
  });

  it("requires a non-empty body", () => {
    expect(() => createRetrospectiveSchema.parse({ body: "   " })).toThrow();
    expect(() => createRetrospectiveSchema.parse({})).toThrow();
  });
});

describe("updateRetrospectiveSchema", () => {
  it("accepts a partial update", () => {
    expect(updateRetrospectiveSchema.parse({ learnings: "New note." }).learnings).toBe("New note.");
  });

  it("accepts an archive flag", () => {
    expect(updateRetrospectiveSchema.parse({ archived: true }).archived).toBe(true);
  });

  it("rejects an empty update", () => {
    expect(() => updateRetrospectiveSchema.parse({})).toThrow();
  });

  it("rejects an unknown key", () => {
    expect(() => updateRetrospectiveSchema.parse({ eventId: "event_2" })).toThrow();
  });
});
