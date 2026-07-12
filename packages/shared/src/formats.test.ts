import { describe, expect, it } from "vitest";

import { formatListSchema, formatSchema } from "./formats.js";

describe("formatSchema", () => {
  it("parses a constructed format", () => {
    const format = formatSchema.parse({
      id: "format-1",
      gameId: "flesh-and-blood",
      key: "cc",
      name: "Classic Constructed",
      isConstructed: true,
    });
    expect(format.key).toBe("cc");
    expect(format.isConstructed).toBe(true);
  });

  it("rejects a format missing its game", () => {
    expect(() =>
      formatSchema.parse({ id: "format-1", key: "cc", name: "Classic Constructed", isConstructed: true }),
    ).toThrow();
  });
});

describe("formatListSchema", () => {
  it("parses the format list envelope", () => {
    const list = formatListSchema.parse({
      data: [{ id: "format-1", gameId: "flesh-and-blood", key: "blitz", name: "Blitz", isConstructed: true }],
    });
    expect(list.data).toHaveLength(1);
  });
});
