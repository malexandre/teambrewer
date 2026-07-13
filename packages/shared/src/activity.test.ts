import { describe, expect, it } from "vitest";

import { activityEventSchema, activityQuerySchema, activityVerbSchema } from "./activity.js";

describe("activityVerbSchema", () => {
  it("accepts the deck + game-log + task lifecycle verbs and the generic commented verb", () => {
    for (const verb of [
      "deck_created",
      "deck_updated",
      "deck_status_changed",
      "game_log_created",
      "task_created",
      "task_status_changed",
      "commented",
    ]) {
      expect(activityVerbSchema.parse(verb)).toBe(verb);
    }
  });

  it("rejects an unknown verb", () => {
    expect(activityVerbSchema.safeParse("deck_deleted").success).toBe(false);
  });
});

describe("activityQuerySchema", () => {
  it("defaults the limit and allows an optional subject filter", () => {
    expect(activityQuerySchema.parse({})).toEqual({ limit: 20 });
    const filtered = activityQuerySchema.parse({ subjectType: "deck", subjectId: "deck_1" });
    expect(filtered.subjectType).toBe("deck");
  });

  it("rejects an unknown subjectType filter", () => {
    expect(activityQuerySchema.safeParse({ subjectType: "mystery" }).success).toBe(false);
  });
});

describe("activityEventSchema", () => {
  it("parses an activity event with its actor", () => {
    const event = {
      id: "a1",
      verb: "deck_created",
      subjectType: "deck",
      subjectId: "deck_1",
      actor: { userId: "u1", username: "alice", displayName: "Alice" },
      createdAt: "2026-07-12T00:00:00.000Z",
    };
    expect(activityEventSchema.parse(event).verb).toBe("deck_created");
  });
});
