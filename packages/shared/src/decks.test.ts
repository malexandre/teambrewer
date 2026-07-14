import { describe, expect, it } from "vitest";

import {
  allowedNextDeckStatuses,
  createDeckSchema,
  createIterationEntrySchema,
  deckListQuerySchema,
  deckStatusChangeSchema,
  deckStatusSchema,
  deckVisibilitySchema,
  isDeckStatusTransitionAllowed,
  recognizeDeckUrlRequestSchema,
  updateDeckSchema,
} from "./decks.js";

describe("deck enums", () => {
  it("accepts the four deck statuses and rejects unknown ones", () => {
    expect(deckStatusSchema.parse("exploratory")).toBe("exploratory");
    expect(deckStatusSchema.parse("tournament_ready")).toBe("tournament_ready");
    expect(() => deckStatusSchema.parse("archived")).toThrow();
  });

  it("accepts the two visibilities and rejects unknown ones", () => {
    expect(deckVisibilitySchema.parse("team")).toBe("team");
    expect(deckVisibilitySchema.parse("private")).toBe("private");
    expect(() => deckVisibilitySchema.parse("public")).toThrow();
  });
});

describe("createDeckSchema", () => {
  const validInput = {
    name: "Aggro Dorinthea",
    formatId: "format-cc",
    externalUrl: "https://fabrary.net/decks/abc123",
  };

  it("accepts a minimal valid deck and applies defaults", () => {
    const parsed = createDeckSchema.parse(validInput);
    expect(parsed.name).toBe("Aggro Dorinthea");
    expect(parsed.visibility).toBe("team");
    expect(parsed.tags).toEqual([]);
    expect(parsed.notes).toBe("");
    expect(parsed.heroId).toBeUndefined();
    // Omitting metaIds leaves it undefined so the server can default the current meta.
    expect(parsed.metaIds).toBeUndefined();
  });

  it("accepts an explicit metaIds set (including empty) and rejects duplicates", () => {
    expect(createDeckSchema.parse({ ...validInput, metaIds: [] }).metaIds).toEqual([]);
    expect(createDeckSchema.parse({ ...validInput, metaIds: ["meta-1"] }).metaIds).toEqual([
      "meta-1",
    ]);
    expect(() =>
      createDeckSchema.parse({ ...validInput, metaIds: ["meta-1", "meta-1"] }),
    ).toThrow();
  });

  it("accepts an optional hero, tags, notes and visibility", () => {
    const parsed = createDeckSchema.parse({
      ...validInput,
      heroId: "hero-dorinthea",
      visibility: "private",
      tags: ["aggro", "weapon"],
      notes: "Testing the new go-wide plan.",
    });
    expect(parsed.heroId).toBe("hero-dorinthea");
    expect(parsed.visibility).toBe("private");
    expect(parsed.tags).toEqual(["aggro", "weapon"]);
  });

  it("rejects a non-URL externalUrl", () => {
    expect(() => createDeckSchema.parse({ ...validInput, externalUrl: "not a url" })).toThrow();
  });

  it("rejects a non-http(s) externalUrl (links are rendered)", () => {
    expect(() =>
      createDeckSchema.parse({ ...validInput, externalUrl: "javascript:alert(1)" }),
    ).toThrow();
    expect(() =>
      createDeckSchema.parse({ ...validInput, externalUrl: "ftp://example.com/deck" }),
    ).toThrow();
  });

  it("requires a non-empty name within the length bound", () => {
    expect(() => createDeckSchema.parse({ ...validInput, name: "" })).toThrow();
    expect(() => createDeckSchema.parse({ ...validInput, name: "x".repeat(101) })).toThrow();
  });

  it("requires a formatId", () => {
    const { formatId, ...withoutFormat } = validInput;
    void formatId;
    expect(() => createDeckSchema.parse(withoutFormat)).toThrow();
  });

  it("never accepts server-controlled fields (teamId/gameId/ownerId/status/source)", () => {
    const parsed = createDeckSchema.parse({
      ...validInput,
      teamId: "team-evil",
      gameId: "riftbound",
      ownerId: "someone-else",
      status: "tournament_ready",
      source: "spoofed",
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty("teamId");
    expect(parsed).not.toHaveProperty("gameId");
    expect(parsed).not.toHaveProperty("ownerId");
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("source");
  });
});

describe("updateDeckSchema", () => {
  it("accepts a partial update", () => {
    const parsed = updateDeckSchema.parse({ name: "Renamed" });
    expect(parsed.name).toBe("Renamed");
  });

  it("allows clearing the hero with null", () => {
    const parsed = updateDeckSchema.parse({ heroId: null });
    expect(parsed.heroId).toBeNull();
  });

  it("rejects a status field (status changes go through the status endpoint)", () => {
    expect(() => updateDeckSchema.parse({ status: "retired" })).toThrow();
  });

  it("accepts a metaIds-only update (replacement set)", () => {
    expect(updateDeckSchema.parse({ metaIds: ["meta-1", "meta-2"] }).metaIds).toEqual([
      "meta-1",
      "meta-2",
    ]);
  });

  it("rejects an empty update", () => {
    expect(() => updateDeckSchema.parse({})).toThrow();
  });
});

describe("deckStatusChangeSchema", () => {
  it("requires a valid status", () => {
    expect(deckStatusChangeSchema.parse({ status: "testing" }).status).toBe("testing");
    expect(() => deckStatusChangeSchema.parse({ status: "nope" })).toThrow();
  });
});

describe("createIterationEntrySchema", () => {
  it("requires a non-empty body", () => {
    expect(createIterationEntrySchema.parse({ body: "-2 X, +2 Y" }).body).toBe("-2 X, +2 Y");
    expect(() => createIterationEntrySchema.parse({ body: "" })).toThrow();
    expect(() => createIterationEntrySchema.parse({ body: "   " })).toThrow();
  });
});

describe("deckListQuerySchema", () => {
  it("defaults and clamps the limit and coerces query params", () => {
    const parsed = deckListQuerySchema.parse({});
    expect(parsed.limit).toBe(20);

    const withLimit = deckListQuerySchema.parse({ limit: "5" });
    expect(withLimit.limit).toBe(5);
  });

  it("rejects an over-large limit rather than silently clamping", () => {
    expect(() => deckListQuerySchema.parse({ limit: "500" })).toThrow();
  });

  it("accepts the documented filters", () => {
    const parsed = deckListQuerySchema.parse({
      heroId: "hero-1",
      formatId: "format-1",
      status: "testing",
      tag: "aggro",
      visibility: "team",
      ownerId: "user-1",
    });
    expect(parsed.status).toBe("testing");
    expect(parsed.tag).toBe("aggro");
  });
});

describe("deck status transitions", () => {
  it("permits free movement among active states and retiring", () => {
    expect(isDeckStatusTransitionAllowed("exploratory", "testing")).toBe(true);
    expect(isDeckStatusTransitionAllowed("tournament_ready", "exploratory")).toBe(true);
    expect(isDeckStatusTransitionAllowed("testing", "retired")).toBe(true);
  });

  it("reopens a retired deck only to testing and rejects no-ops", () => {
    expect(isDeckStatusTransitionAllowed("retired", "testing")).toBe(true);
    expect(isDeckStatusTransitionAllowed("retired", "exploratory")).toBe(false);
    expect(isDeckStatusTransitionAllowed("testing", "testing")).toBe(false);
  });

  it("lists the allowed next statuses without the current one", () => {
    expect(allowedNextDeckStatuses("retired")).toEqual(["testing"]);
    expect(allowedNextDeckStatuses("exploratory")).not.toContain("exploratory");
  });
});

describe("recognizeDeckUrlRequestSchema", () => {
  it("accepts any string url (recognition itself is best-effort)", () => {
    expect(recognizeDeckUrlRequestSchema.parse({ url: "https://fabrary.net/decks/x" }).url).toBe(
      "https://fabrary.net/decks/x",
    );
    expect(recognizeDeckUrlRequestSchema.parse({ url: "partial" }).url).toBe("partial");
  });
});
