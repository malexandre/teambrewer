import { describe, expect, it } from "vitest";

import { cardSearchQuerySchema, cardSearchResponseSchema, cardSummarySchema } from "./cards.js";

describe("cardSummarySchema", () => {
  it("parses a card with a pitch and image", () => {
    const card = cardSummarySchema.parse({
      id: "card-1",
      name: "Command and Conquer",
      pitch: 1,
      imageUrl: "https://example.test/cnc.png",
    });
    expect(card.name).toBe("Command and Conquer");
    expect(card.pitch).toBe(1);
  });

  it("allows a null pitch and null image (games without pitch, missing art)", () => {
    const card = cardSummarySchema.parse({
      id: "card-2",
      name: "Some Weapon",
      pitch: null,
      imageUrl: null,
    });
    expect(card.pitch).toBeNull();
    expect(card.imageUrl).toBeNull();
  });

  it("rejects a card missing a name", () => {
    expect(() => cardSummarySchema.parse({ id: "card-3", pitch: 1, imageUrl: null })).toThrow();
  });
});

describe("cardSearchQuerySchema", () => {
  it("coerces string query params and applies the default limit", () => {
    const query = cardSearchQuerySchema.parse({ query: "command", pitch: "1", cursor: "abc" });
    expect(query.pitch).toBe(1);
    expect(query.limit).toBe(20);
    expect(query.cursor).toBe("abc");
  });

  it("clamps an over-large limit by rejecting it", () => {
    expect(() => cardSearchQuerySchema.parse({ limit: "500" })).toThrow();
  });

  it("allows an empty query (browse the whole game's cards)", () => {
    const query = cardSearchQuerySchema.parse({});
    expect(query.query).toBeUndefined();
    expect(query.limit).toBe(20);
  });
});

describe("cardSearchResponseSchema", () => {
  it("parses a page with a next cursor", () => {
    const page = cardSearchResponseSchema.parse({
      data: [{ id: "card-1", name: "Command and Conquer", pitch: 1, imageUrl: null }],
      nextCursor: "next",
    });
    expect(page.data).toHaveLength(1);
    expect(page.nextCursor).toBe("next");
  });

  it("parses the last page with a null cursor", () => {
    const page = cardSearchResponseSchema.parse({ data: [], nextCursor: null });
    expect(page.nextCursor).toBeNull();
  });
});
