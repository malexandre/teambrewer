import { describe, expect, it } from "vitest";

import { gameSummaryListSchema, gameSummarySchema } from "./games.js";

describe("gameSummarySchema", () => {
  it("accepts a catalog entry with id, key and name", () => {
    const parsed = gameSummarySchema.parse({
      id: "flesh-and-blood",
      key: "flesh_and_blood",
      name: "Flesh and Blood",
    });
    expect(parsed).toEqual({
      id: "flesh-and-blood",
      key: "flesh_and_blood",
      name: "Flesh and Blood",
    });
  });

  it("rejects an entry missing a field", () => {
    expect(() => gameSummarySchema.parse({ id: "riftbound", key: "riftbound" })).toThrow();
  });
});

describe("gameSummaryListSchema", () => {
  it("wraps the catalog in a data envelope", () => {
    const parsed = gameSummaryListSchema.parse({
      data: [{ id: "riftbound", key: "riftbound", name: "Riftbound" }],
    });
    expect(parsed.data).toHaveLength(1);
  });
});
