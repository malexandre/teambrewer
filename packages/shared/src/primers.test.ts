import { describe, expect, it } from "vitest";

import { createPrimerSchema, primerListQuerySchema, updatePrimerSchema } from "./primers.js";

describe("createPrimerSchema", () => {
  const base = {
    title: "Beating Aggro Fai",
    kind: "matchup" as const,
    body: "Keep two blues; block the on-hit triggers.",
  };

  it("accepts a minimal primer and defaults visibility to team", () => {
    const parsed = createPrimerSchema.parse(base);
    expect(parsed.visibility).toBe("team");
    expect(parsed.relatedDeckId).toBeUndefined();
  });

  it("accepts a related deck link", () => {
    const parsed = createPrimerSchema.parse({ ...base, relatedDeckId: "deck_1" });
    expect(parsed.relatedDeckId).toBe("deck_1");
  });

  it("requires a title", () => {
    expect(() => createPrimerSchema.parse({ ...base, title: "  " })).toThrow();
  });

  it("requires a non-empty body", () => {
    expect(() => createPrimerSchema.parse({ ...base, body: "   " })).toThrow();
  });

  it("rejects an unknown kind", () => {
    expect(() => createPrimerSchema.parse({ ...base, kind: "strategy" })).toThrow();
  });

  it("strips a client-supplied teamId / authorId", () => {
    const parsed = createPrimerSchema.parse({
      ...base,
      teamId: "team_forged",
      authorId: "user_forged",
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty("teamId");
    expect(parsed).not.toHaveProperty("authorId");
  });
});

describe("updatePrimerSchema", () => {
  it("accepts a body-only update", () => {
    expect(updatePrimerSchema.parse({ body: "Revised." }).body).toBe("Revised.");
  });

  it("allows clearing the related deck with null", () => {
    expect(updatePrimerSchema.parse({ relatedDeckId: null }).relatedDeckId).toBeNull();
  });

  it("rejects an empty update", () => {
    expect(() => updatePrimerSchema.parse({})).toThrow();
  });

  it("rejects unknown keys", () => {
    expect(() => updatePrimerSchema.parse({ authorId: "user_2" })).toThrow();
  });
});

describe("primerListQuerySchema", () => {
  it("defaults the limit and accepts filters", () => {
    const parsed = primerListQuerySchema.parse({ kind: "deck_primer", relatedDeckId: "deck_1" });
    expect(parsed.limit).toBe(20);
    expect(parsed.kind).toBe("deck_primer");
  });

  it("coerces a string limit", () => {
    expect(primerListQuerySchema.parse({ limit: "5" }).limit).toBe(5);
  });
});
