import { describe, expect, it } from "vitest";

import { gameConfigSchema } from "./game-config.js";

describe("gameConfigSchema", () => {
  it("accepts a valid config", () => {
    expect(
      gameConfigSchema.parse({
        gameId: "flesh-and-blood",
        identityLabel: "Hero",
        defaultBestOf: 1,
      }),
    ).toEqual({ gameId: "flesh-and-blood", identityLabel: "Hero", defaultBestOf: 1 });
  });

  it("rejects a non-1/3/5 best-of", () => {
    expect(() =>
      gameConfigSchema.parse({ gameId: "x", identityLabel: "Hero", defaultBestOf: 2 }),
    ).toThrow();
  });
});
