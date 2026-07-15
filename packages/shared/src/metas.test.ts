import { describe, expect, it } from "vitest";

import { createMetaSchema, metaSummarySchema, updateMetaSchema } from "./metas.js";

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

const baseMeta = {
  name: "Season",
  formatId: "format_cc",
  startDate: "2026-07-01",
  endDate: "2026-09-30",
} as const;

describe("createMetaSchema change reason", () => {
  it("accepts a ban-list reason with no extra data", () => {
    const parsed = createMetaSchema.parse({ ...baseMeta, changeReason: "ban_list" });
    expect(parsed.changeReason).toBe("ban_list");
  });

  it("accepts a living-legend reason with a hero", () => {
    const parsed = createMetaSchema.parse({
      ...baseMeta,
      changeReason: "living_legend",
      changeReasonHeroId: "hero_dorinthea",
    });
    expect(parsed.changeReasonHeroId).toBe("hero_dorinthea");
  });

  it("accepts a product-release reason with an https image URL", () => {
    const parsed = createMetaSchema.parse({
      ...baseMeta,
      changeReason: "product_release",
      changeReasonImageUrl: "https://fabtcg.com/marketing/heavy-hitters.png",
    });
    expect(parsed.changeReasonImageUrl).toBe("https://fabtcg.com/marketing/heavy-hitters.png");
  });

  it("rejects an unknown reason", () => {
    expect(createMetaSchema.safeParse({ ...baseMeta, changeReason: "errata" }).success).toBe(false);
  });

  it("rejects a hero when the reason is not living_legend", () => {
    expect(
      createMetaSchema.safeParse({
        ...baseMeta,
        changeReason: "ban_list",
        changeReasonHeroId: "hero_dorinthea",
      }).success,
    ).toBe(false);
  });

  it("rejects an image URL when the reason is not product_release", () => {
    expect(
      createMetaSchema.safeParse({
        ...baseMeta,
        changeReason: "ban_list",
        changeReasonImageUrl: "https://fabtcg.com/x.png",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-http(s) image URL", () => {
    expect(
      createMetaSchema.safeParse({
        ...baseMeta,
        changeReason: "product_release",
        changeReasonImageUrl: "ftp://fabtcg.com/x.png",
      }).success,
    ).toBe(false);
  });
});

describe("updateMetaSchema change reason", () => {
  it("accepts clearing the reason with null", () => {
    expect(updateMetaSchema.safeParse({ changeReason: null }).success).toBe(true);
  });

  it("rejects an image URL without the product-release reason", () => {
    expect(
      updateMetaSchema.safeParse({
        changeReason: "living_legend",
        changeReasonImageUrl: "https://fabtcg.com/x.png",
      }).success,
    ).toBe(false);
  });
});

describe("metaSummarySchema change reason", () => {
  it("carries the nullable change-reason fields", () => {
    const parsed = metaSummarySchema.parse({
      id: "meta_1",
      name: "Season",
      formatId: "format_cc",
      formatName: "Classic Constructed",
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-09-30T00:00:00.000Z",
      archivedAt: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      changeReason: "living_legend",
      changeReasonHeroId: "hero_dorinthea",
      changeReasonImageUrl: null,
    });
    expect(parsed.changeReason).toBe("living_legend");
    expect(parsed.changeReasonHeroId).toBe("hero_dorinthea");
    expect(parsed.changeReasonImageUrl).toBeNull();
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
