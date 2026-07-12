import { describe, expect, it } from "vitest";

import {
  notificationListQuerySchema,
  notificationListResponseSchema,
  notificationSchema,
} from "./notifications.js";

describe("notificationListQuerySchema", () => {
  it("defaults limit and leaves unreadOnly unset", () => {
    expect(notificationListQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it("decodes unreadOnly from the literal strings", () => {
    expect(notificationListQuerySchema.parse({ unreadOnly: "true" }).unreadOnly).toBe(true);
    expect(notificationListQuerySchema.parse({ unreadOnly: "false" }).unreadOnly).toBe(false);
  });

  it("clamps the limit to the allowed range", () => {
    expect(notificationListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(notificationListQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });
});

describe("notificationSchema", () => {
  it("parses a mention notification", () => {
    const notification = {
      id: "n1",
      type: "mention",
      subjectType: "deck",
      subjectId: "deck_1",
      commentId: "c1",
      actor: { userId: "u2", username: "bob", displayName: "Bob" },
      readAt: null,
      createdAt: "2026-07-12T00:00:00.000Z",
    };
    expect(notificationSchema.parse(notification).type).toBe("mention");
  });

  it("rejects an unknown notification type", () => {
    expect(
      notificationSchema.safeParse({
        id: "n1",
        type: "reply",
        subjectType: "deck",
        subjectId: "deck_1",
        commentId: null,
        actor: null,
        readAt: null,
        createdAt: "2026-07-12T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("notificationListResponseSchema", () => {
  it("carries the unread count and cursor", () => {
    const parsed = notificationListResponseSchema.parse({
      data: [],
      unreadCount: 3,
      nextCursor: null,
    });
    expect(parsed.unreadCount).toBe(3);
  });
});
