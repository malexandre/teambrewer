import { describe, expect, it } from "vitest";

import { createMetaSchema, updateMetaSchema } from "./metas.js";

describe("createMetaSchema", () => {
  it("accepts an ordered window and defaults the description", () => {
    const parsed = createMetaSchema.parse({
      name: "Nationals season",
      formatId: "format_cc",
      startDate: "2026-07-01",
      endDate: "2026-09-30",
    });
    expect(parsed.description).toBe("");
    expect(parsed.name).toBe("Nationals season");
    expect(parsed.formatId).toBe("format_cc");
  });

  it("requires a format", () => {
    expect(
      createMetaSchema.safeParse({
        name: "No format",
        startDate: "2026-07-01",
        endDate: "2026-09-30",
      }).success,
    ).toBe(false);
  });

  it("allows a single-day window (end equals start)", () => {
    expect(
      createMetaSchema.safeParse({
        name: "Launch weekend",
        formatId: "format_cc",
        startDate: "2026-07-01",
        endDate: "2026-07-01",
      }).success,
    ).toBe(true);
  });

  it("rejects an end before the start", () => {
    expect(
      createMetaSchema.safeParse({
        name: "Backwards",
        formatId: "format_cc",
        startDate: "2026-09-30",
        endDate: "2026-07-01",
      }).success,
    ).toBe(false);
  });

  it("rejects an unparseable date", () => {
    expect(
      createMetaSchema.safeParse({
        name: "Bad",
        formatId: "format_cc",
        startDate: "not-a-date",
        endDate: "2026-07-01",
      }).success,
    ).toBe(false);
  });
});

describe("updateMetaSchema", () => {
  it("requires at least one field and rejects unknown keys", () => {
    expect(updateMetaSchema.safeParse({}).success).toBe(false);
    expect(updateMetaSchema.safeParse({ teamId: "team_1" }).success).toBe(false);
  });

  it("checks window ordering only when both boundaries are present", () => {
    expect(updateMetaSchema.safeParse({ startDate: "2026-07-01" }).success).toBe(true);
    expect(
      updateMetaSchema.safeParse({ startDate: "2026-09-30", endDate: "2026-07-01" }).success,
    ).toBe(false);
  });

  it("accepts editing the format and rejects an empty format", () => {
    expect(updateMetaSchema.safeParse({ formatId: "format_blitz" }).success).toBe(true);
    expect(updateMetaSchema.safeParse({ formatId: "" }).success).toBe(false);
  });
});
