import type { Query } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { shouldDehydrateQuery, shouldPersistQueryKey } from "@/app/query-persistence";

describe("query persistence filter", () => {
  it("persists team-scoped keys (teamId first)", () => {
    expect(shouldPersistQueryKey(["team-abc", "decks", {}])).toBe(true);
    expect(shouldPersistQueryKey(["team-abc", "cards", { query: "rhi" }])).toBe(true);
    expect(shouldPersistQueryKey(["team-abc", "members"])).toBe(true);
  });

  it("never persists per-user or global keys", () => {
    // These could leak the previous user's identity/admin data on a shared device.
    expect(shouldPersistQueryKey(["me"])).toBe(false);
    expect(shouldPersistQueryKey(["me", "teams"])).toBe(false);
    expect(shouldPersistQueryKey(["me", "sessions"])).toBe(false);
    expect(shouldPersistQueryKey(["admin", "teams"])).toBe(false);
    expect(shouldPersistQueryKey(["admin", "team-abc", "members"])).toBe(false);
  });

  it("refuses to persist a malformed (non-string-prefixed) key", () => {
    expect(shouldPersistQueryKey([])).toBe(false);
    expect(shouldPersistQueryKey([42, "decks"])).toBe(false);
  });

  it("only dehydrates successful, persistable queries", () => {
    const asQuery = (queryKey: readonly unknown[], status: string): Query =>
      ({ queryKey, state: { status } }) as unknown as Query;

    expect(shouldDehydrateQuery(asQuery(["team-abc", "decks", {}], "success"))).toBe(true);
    expect(shouldDehydrateQuery(asQuery(["team-abc", "decks", {}], "error"))).toBe(false);
    expect(shouldDehydrateQuery(asQuery(["me"], "success"))).toBe(false);
  });
});
