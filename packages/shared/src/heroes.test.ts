import { describe, expect, it } from "vitest";

import { heroListQuerySchema, heroListSchema, heroSchema } from "./heroes.js";

describe("heroSchema", () => {
  it("parses a hero with classes, talents, starting life, and legal formats", () => {
    const hero = heroSchema.parse({
      id: "hero-1",
      name: "Dorinthea Ironsong",
      classes: ["Warrior"],
      talents: [],
      startingLife: 20,
      imageUrl: "https://example.test/dori.png",
      legalFormatKeys: ["cc", "blitz"],
    });
    expect(hero.classes).toEqual(["Warrior"]);
    expect(hero.startingLife).toBe(20);
    expect(hero.legalFormatKeys).toEqual(["cc", "blitz"]);
  });

  it("allows a null starting life, null image, and an empty legal-format list", () => {
    const hero = heroSchema.parse({
      id: "hero-2",
      name: "Unknown",
      classes: [],
      talents: [],
      startingLife: null,
      imageUrl: null,
      legalFormatKeys: [],
    });
    expect(hero.startingLife).toBeNull();
    expect(hero.legalFormatKeys).toEqual([]);
  });

  it("rejects a hero whose classes are not an array", () => {
    expect(() =>
      heroSchema.parse({
        id: "hero-3",
        name: "Broken",
        classes: "Warrior",
        talents: [],
        startingLife: null,
        imageUrl: null,
        legalFormatKeys: [],
      }),
    ).toThrow();
  });
});

describe("heroListQuerySchema", () => {
  it("accepts an optional formatId", () => {
    expect(heroListQuerySchema.parse({ formatId: "format-1" })).toEqual({ formatId: "format-1" });
    expect(heroListQuerySchema.parse({})).toEqual({});
  });
});

describe("heroListSchema", () => {
  it("parses the hero list envelope", () => {
    const list = heroListSchema.parse({
      data: [
        {
          id: "hero-1",
          name: "Dorinthea",
          classes: ["Warrior"],
          talents: [],
          startingLife: 20,
          imageUrl: null,
          legalFormatKeys: ["cc"],
        },
      ],
    });
    expect(list.data).toHaveLength(1);
  });
});
