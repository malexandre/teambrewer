import { describe, expect, it } from "vitest";

import { heroListSchema, heroSchema } from "./heroes.js";

describe("heroSchema", () => {
  it("parses a hero with classes, talents, and starting life", () => {
    const hero = heroSchema.parse({
      id: "hero-1",
      name: "Dorinthea Ironsong",
      classes: ["Warrior"],
      talents: [],
      startingLife: 20,
      imageUrl: "https://example.test/dori.png",
    });
    expect(hero.classes).toEqual(["Warrior"]);
    expect(hero.startingLife).toBe(20);
  });

  it("allows a null starting life and null image", () => {
    const hero = heroSchema.parse({
      id: "hero-2",
      name: "Unknown",
      classes: [],
      talents: [],
      startingLife: null,
      imageUrl: null,
    });
    expect(hero.startingLife).toBeNull();
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
      }),
    ).toThrow();
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
        },
      ],
    });
    expect(list.data).toHaveLength(1);
  });
});
