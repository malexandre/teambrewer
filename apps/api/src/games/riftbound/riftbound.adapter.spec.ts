import { describe, expect, it } from "vitest";

import type { RiftcodexCardSourceClient } from "./riftcodex-card-source.client.js";
import { RiftboundAdapter } from "./riftbound.adapter.js";
import { RIFTBOUND_CARD_FIXTURE } from "./riftbound.fixture.js";

/** The adapter's pure logic needs no real source client. */
function createAdapter(): RiftboundAdapter {
  const stubSource = {
    fetchRawCards: async () => RIFTBOUND_CARD_FIXTURE,
    sourceUrl: "https://api.riftcodex.test",
    sourceVersion: "riftcodex-test",
  } as unknown as RiftcodexCardSourceClient;
  return new RiftboundAdapter(stubSource);
}

const byId = (id: string) =>
  RIFTBOUND_CARD_FIXTURE.find((record) => (record as { id: string }).id === id)!;

describe("RiftboundAdapter identity", () => {
  const adapter = createAdapter();

  it("labels the identity concept 'Legend'", () => {
    expect(adapter.key).toBe("riftbound");
    expect(adapter.displayName).toBe("Riftbound");
    expect(adapter.identityLabel).toBe("Legend");
  });

  it("defaults Riftbound games to best-of-three", () => {
    expect(adapter.defaultBestOf).toBe(3);
  });
});

describe("RiftboundAdapter.mapCard", () => {
  const adapter = createAdapter();

  it("maps id, name, and the card image; Riftbound has no pitch", () => {
    expect(adapter.mapCard(byId("rc-unit-pakaa"))).toEqual({
      externalId: "rc-unit-pakaa",
      name: "Pakaa Cub",
      pitch: null,
      imageUrl: "https://cards.test/pakaa.png",
    });
  });

  it("maps a null media image to a null imageUrl", () => {
    expect(adapter.mapCard(byId("rc-spell-noimg")).imageUrl).toBeNull();
  });

  it("tolerates a record with no media object", () => {
    const mapped = adapter.mapCard(byId("rc-battlefield-abyss"));
    expect(mapped.externalId).toBe("rc-battlefield-abyss");
    expect(mapped.imageUrl).toBeNull();
  });
});

describe("RiftboundAdapter.cardIdentity", () => {
  const adapter = createAdapter();

  it("is name-only, so an alternate-art printing shares the base card's identity", () => {
    const base = adapter.cardIdentity(adapter.mapCard(byId("rc-unit-pakaa")));
    const alternateArt = adapter.cardIdentity(adapter.mapCard(byId("rc-unit-pakaa-alt")));
    expect(base).toBe("Pakaa Cub");
    expect(alternateArt).toBe(base);
  });

  it("distinguishes cards with different names", () => {
    const pakaa = adapter.cardIdentity(adapter.mapCard(byId("rc-unit-pakaa")));
    const yasuo = adapter.cardIdentity(adapter.mapCard(byId("rc-legend-yasuo")));
    expect(pakaa).not.toBe(yasuo);
  });
});

describe("RiftboundAdapter.deriveHeroes", () => {
  const adapter = createAdapter();
  const legends = adapter.deriveHeroes(RIFTBOUND_CARD_FIXTURE);

  it("derives only Legend-type records as identities", () => {
    expect(legends.map((legend) => legend.name)).toEqual(["Yasuo, the Unforgiven"]);
  });

  it("maps Domain onto classes and Region (tags) onto talents", () => {
    const yasuo = legends[0]!;
    expect(yasuo.externalId).toBe("rc-legend-yasuo");
    expect(yasuo.classes).toEqual(["Fury", "Order"]);
    expect(yasuo.talents).toEqual(["Ionia"]);
    expect(yasuo.startingLife).toBeNull();
    expect(yasuo.imageUrl).toBe("https://cards.test/yasuo.png");
  });

  it("carries no legal formats (Riftcodex legality is not wired)", () => {
    expect(legends[0]!.legalFormatKeys).toEqual([]);
  });
});

describe("RiftboundAdapter.listFormats", () => {
  const adapter = createAdapter();

  it("returns the Riftbound formats (Standard constructed, Draft/Sealed limited)", () => {
    const formats = adapter.listFormats();
    expect(formats.map((format) => format.key)).toEqual(["standard", "draft", "sealed"]);
    const standard = formats.find((format) => format.key === "standard")!;
    expect(standard.isConstructed).toBe(true);
    expect(formats.find((format) => format.key === "draft")!.isConstructed).toBe(false);
  });
});

describe("RiftboundAdapter.describeSource", () => {
  it("attributes the Riftcodex source with its pinned version", () => {
    const source = createAdapter().describeSource();
    expect(source.sourceName).toBe("riftcodex");
    expect(source.sourceUrl).toBe("https://api.riftcodex.test");
    expect(source.sourceVersion).toBe("riftcodex-test");
  });
});
