import { describe, expect, it } from "vitest";

import type {
  FormatDefinition,
  GameAdapter,
  NormalizedCard,
  NormalizedHero,
  RawCardRecord,
} from "./game-adapter.interface.js";
import { GameAdapterRegistry } from "./game-adapter.registry.js";

/**
 * A minimal adapter that satisfies the contract, used to test the registry in
 * isolation (no Nest DI, no game specifics).
 */
function createStubAdapter(key: string): GameAdapter {
  return {
    key,
    displayName: `Game ${key}`,
    identityLabel: "Identity",
    listFormats(): FormatDefinition[] {
      return [{ key: "constructed", name: "Constructed", isConstructed: true, sortOrder: 0 }];
    },
    describeSource() {
      return { sourceName: "stub", sourceUrl: "https://stub.test", sourceVersion: "v0" };
    },
    async fetchCardSource(): Promise<RawCardRecord[]> {
      return [];
    },
    mapCard(record: RawCardRecord): NormalizedCard {
      return { externalId: String(record["id"]), name: String(record["name"]), pitch: null, imageUrl: null };
    },
    deriveHeroes(): NormalizedHero[] {
      return [];
    },
    cardIdentity(card: NormalizedCard): string {
      return card.name;
    },
  };
}

describe("GameAdapterRegistry", () => {
  it("resolves a registered adapter by its key", () => {
    const adapter = createStubAdapter("flesh_and_blood");
    const registry = new GameAdapterRegistry([adapter]);
    expect(registry.get("flesh_and_blood")).toBe(adapter);
    expect(registry.has("flesh_and_blood")).toBe(true);
    expect(registry.keys()).toEqual(["flesh_and_blood"]);
  });

  it("throws for a game key with no registered adapter", () => {
    const registry = new GameAdapterRegistry([createStubAdapter("flesh_and_blood")]);
    expect(registry.has("riftbound")).toBe(false);
    expect(() => registry.get("riftbound")).toThrow(/riftbound/);
  });

  it("registers multiple adapters", () => {
    const registry = new GameAdapterRegistry([
      createStubAdapter("flesh_and_blood"),
      createStubAdapter("riftbound"),
    ]);
    expect(registry.keys()).toContain("flesh_and_blood");
    expect(registry.keys()).toContain("riftbound");
  });
});
