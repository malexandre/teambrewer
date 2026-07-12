import { describe, expect, it } from "vitest";

import { createDecisionSchema, updateDecisionSchema } from "./decisions.js";

describe("createDecisionSchema", () => {
  const base = {
    title: "Register Fai for Nationals",
    context: "We tested five decks over three weeks.",
    decision: "Bring Fai as the main; Kano as pocket.",
    rationale: "Best coverage against the expected aggro-heavy field.",
  };

  it("accepts a decision without a related subject", () => {
    const parsed = createDecisionSchema.parse(base);
    expect(parsed.relatedSubjectRef).toBeUndefined();
    expect(parsed.title).toBe(base.title);
  });

  it("accepts a valid polymorphic related-subject ref", () => {
    const parsed = createDecisionSchema.parse({
      ...base,
      relatedSubjectRef: { subjectType: "event", subjectId: "event_1" },
    });
    expect(parsed.relatedSubjectRef).toEqual({ subjectType: "event", subjectId: "event_1" });
  });

  it("rejects a related-subject ref with an unknown subject type", () => {
    expect(() =>
      createDecisionSchema.parse({
        ...base,
        relatedSubjectRef: { subjectType: "spreadsheet", subjectId: "x" },
      }),
    ).toThrow();
  });

  it("rejects a related-subject ref missing its id", () => {
    expect(() =>
      createDecisionSchema.parse({
        ...base,
        relatedSubjectRef: { subjectType: "deck", subjectId: "" },
      }),
    ).toThrow();
  });

  it("requires context, decision, and rationale", () => {
    expect(() => createDecisionSchema.parse({ ...base, context: "  " })).toThrow();
    expect(() => createDecisionSchema.parse({ ...base, decision: "  " })).toThrow();
    expect(() => createDecisionSchema.parse({ ...base, rationale: "  " })).toThrow();
  });

  it("strips a client-supplied teamId / authorId / decidedAt", () => {
    const parsed = createDecisionSchema.parse({
      ...base,
      teamId: "team_forged",
      authorId: "user_forged",
      decidedAt: "2020-01-01T00:00:00.000Z",
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty("teamId");
    expect(parsed).not.toHaveProperty("authorId");
    expect(parsed).not.toHaveProperty("decidedAt");
  });
});

describe("updateDecisionSchema", () => {
  it("accepts a rationale-only correction", () => {
    expect(updateDecisionSchema.parse({ rationale: "Refined." }).rationale).toBe("Refined.");
  });

  it("allows clearing the related-subject ref with null", () => {
    expect(updateDecisionSchema.parse({ relatedSubjectRef: null }).relatedSubjectRef).toBeNull();
  });

  it("rejects an empty update", () => {
    expect(() => updateDecisionSchema.parse({})).toThrow();
  });
});
