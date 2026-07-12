import { describe, expect, it } from "vitest";

import { queryKeys } from "./query-keys";

describe("queryKeys", () => {
  it("scopes team-owned keys by teamId first, so switching teams changes the cache entry", () => {
    expect(queryKeys.members("team-a")).toEqual(["team-a", "members"]);
    expect(queryKeys.members("team-b")).toEqual(["team-b", "members"]);
    // Different teams -> different keys -> no cache bleed.
    expect(queryKeys.members("team-a")).not.toEqual(queryKeys.members("team-b"));
  });

  it("scopes deck keys by teamId first, including the list filters", () => {
    expect(queryKeys.decks("team-a", { status: "testing" })).toEqual([
      "team-a",
      "decks",
      { status: "testing" },
    ]);
    expect(queryKeys.deck("team-a", "deck-1")).toEqual(["team-a", "deck", "deck-1"]);
    expect(queryKeys.deckIterations("team-a", "deck-1")).toEqual([
      "team-a",
      "deck",
      "deck-1",
      "iterations",
    ]);
    expect(queryKeys.deck("team-a", "deck-1")).not.toEqual(queryKeys.deck("team-b", "deck-1"));
  });

  it("keeps self/global keys out of the team scope", () => {
    expect(queryKeys.me()).toEqual(["me"]);
    expect(queryKeys.myTeams()).toEqual(["me", "teams"]);
    expect(queryKeys.adminTeams()).toEqual(["admin", "teams"]);
  });
});
