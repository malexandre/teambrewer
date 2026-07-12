import { describe, expect, it } from "vitest";

import { cardDataVersionSchema, cardSyncResponseSchema } from "./card-data.js";

describe("cardDataVersionSchema", () => {
  it("parses a card-data provenance record", () => {
    const version = cardDataVersionSchema.parse({
      sourceName: "the-fab-cube/flesh-and-blood-cards",
      sourceUrl: "https://github.com/the-fab-cube/flesh-and-blood-cards",
      sourceVersion: "v1.2.3",
      lastSyncedAt: "2026-07-12T00:00:00.000Z",
      cardCount: 4200,
    });
    expect(version.sourceVersion).toBe("v1.2.3");
    expect(version.cardCount).toBe(4200);
  });

  it("rejects a record with a non-integer card count", () => {
    expect(() =>
      cardDataVersionSchema.parse({
        sourceName: "src",
        sourceUrl: "https://example.test",
        sourceVersion: "v1",
        lastSyncedAt: "2026-07-12T00:00:00.000Z",
        cardCount: 4.5,
      }),
    ).toThrow();
  });
});

describe("cardSyncResponseSchema", () => {
  it("parses a per-game sync result envelope", () => {
    const response = cardSyncResponseSchema.parse({
      data: [
        { gameId: "flesh-and-blood", cardCount: 4200, heroCount: 90, sourceVersion: "v8.2.0" },
      ],
    });
    expect(response.data[0]?.gameId).toBe("flesh-and-blood");
  });
});
