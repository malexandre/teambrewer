import { describe, expect, it } from "vitest";

import type { FabCardSourceClient } from "./fab-card-source.client.js";
import { FleshAndBloodAdapter } from "./flesh-and-blood.adapter.js";
import { FLESH_AND_BLOOD_CARD_FIXTURE } from "./flesh-and-blood.fixture.js";

/** The adapter's pure logic needs no real source client. */
function createAdapter(): FleshAndBloodAdapter {
  const stubSource = {
    fetchRawCards: async () => FLESH_AND_BLOOD_CARD_FIXTURE,
  } as unknown as FabCardSourceClient;
  return new FleshAndBloodAdapter(stubSource);
}

const byExternalId = (externalId: string) =>
  FLESH_AND_BLOOD_CARD_FIXTURE.find(
    (record) => (record as { unique_id: string }).unique_id === externalId,
  )!;

describe("FleshAndBloodAdapter.mapCard", () => {
  const adapter = createAdapter();

  it("maps name, pitch, and a representative image", () => {
    const mapped = adapter.mapCard(byExternalId("absorb-aether-1"));
    expect(mapped).toEqual({
      externalId: "absorb-aether-1",
      name: "Absorb in Aether",
      pitch: 1,
      imageUrl: "https://cards.test/AiA001.webp",
    });
  });

  it("maps a blank pitch to null", () => {
    const mapped = adapter.mapCard(byExternalId("arakni-hero"));
    expect(mapped.pitch).toBeNull();
  });

  it("skips a printing with no image and uses the next by set_printing_unique_id", () => {
    const mapped = adapter.mapCard(byExternalId("no-first-image"));
    expect(mapped.imageUrl).toBe("https://cards.test/BBB111.webp");
  });
});

describe("FleshAndBloodAdapter.cardIdentity", () => {
  const adapter = createAdapter();

  it("gives the same name at different pitch values distinct identities", () => {
    const pitchOne = adapter.cardIdentity(adapter.mapCard(byExternalId("absorb-aether-1")));
    const pitchThree = adapter.cardIdentity(adapter.mapCard(byExternalId("absorb-aether-3")));
    expect(pitchOne).not.toBe(pitchThree);
    expect(pitchOne).toBe("Absorb in Aether#1");
    expect(pitchThree).toBe("Absorb in Aether#3");
  });
});

describe("FleshAndBloodAdapter.deriveHeroes", () => {
  const adapter = createAdapter();
  const heroes = adapter.deriveHeroes(FLESH_AND_BLOOD_CARD_FIXTURE);

  it("derives only hero-type records", () => {
    expect(heroes.map((hero) => hero.name).sort()).toEqual(["Arakni", "Briar, Warden of Thorns"]);
  });

  it("splits class, talent, and supertype out of the types array", () => {
    const briar = heroes.find((hero) => hero.name === "Briar, Warden of Thorns")!;
    expect(briar.classes).toEqual(["Runeblade"]);
    expect(briar.talents).toEqual(["Elemental"]);
    expect(briar.startingLife).toBe(20);
  });

  it("derives a hero with no talent", () => {
    const arakni = heroes.find((hero) => hero.name === "Arakni")!;
    expect(arakni.classes).toEqual(["Assassin"]);
    expect(arakni.talents).toEqual([]);
    expect(arakni.startingLife).toBe(20);
  });

  it("keeps a young hero out of Classic Constructed but legal in Blitz/Commoner", () => {
    const arakni = heroes.find((hero) => hero.name === "Arakni")!;
    expect(arakni.legalFormatKeys).not.toContain("cc");
    expect(arakni.legalFormatKeys).toEqual(
      expect.arrayContaining(["blitz", "commoner", "silver_age"]),
    );
  });

  it("excludes a Living-Legend-retired hero from CC and Blitz while keeping it LL-legal", () => {
    const briar = heroes.find((hero) => hero.name === "Briar, Warden of Thorns")!;
    // The source still reports cc_legal/blitz_legal true, but the living_legend
    // markers demote it — the adapter's rule (not the core) enforces that.
    expect(briar.legalFormatKeys).not.toContain("cc");
    expect(briar.legalFormatKeys).not.toContain("blitz");
    expect(briar.legalFormatKeys).toContain("ll");
  });
});

describe("FleshAndBloodAdapter.recognizeDeckUrl", () => {
  const adapter = createAdapter();

  it("recognizes a Fabrary deck URL and extracts its id", () => {
    expect(adapter.recognizeDeckUrl("https://fabrary.net/decks/abc123")).toEqual({
      provider: "fabrary",
      externalId: "abc123",
    });
  });

  it("returns null for an unrelated URL", () => {
    expect(adapter.recognizeDeckUrl("https://example.com/decks/abc123")).toBeNull();
  });

  it("returns null for a non-URL", () => {
    expect(adapter.recognizeDeckUrl("not a url")).toBeNull();
  });
});

describe("FleshAndBloodAdapter.listFormats", () => {
  it("returns the FaB formats including Classic Constructed and Blitz", () => {
    const keys = createAdapter()
      .listFormats()
      .map((format) => format.key);
    expect(keys).toContain("cc");
    expect(keys).toContain("blitz");
  });
});

describe("FleshAndBloodAdapter defaultBestOf", () => {
  it("defaults Flesh and Blood games to a single game (Bo1)", () => {
    const adapter = createAdapter();
    expect(adapter.defaultBestOf).toBe(1);
  });
});
