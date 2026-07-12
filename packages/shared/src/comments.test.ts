import { describe, expect, it } from "vitest";

import { commentSchema, createCommentSchema, updateCommentSchema } from "./comments.js";

describe("createCommentSchema", () => {
  const valid = { subjectType: "deck", subjectId: "deck_1", body: "looks good" };

  it("accepts a top-level comment", () => {
    expect(createCommentSchema.parse(valid)).toEqual({ ...valid, parentCommentId: undefined });
  });

  it("accepts a reply with a parentCommentId", () => {
    const parsed = createCommentSchema.parse({ ...valid, parentCommentId: "comment_1" });
    expect(parsed.parentCommentId).toBe("comment_1");
  });

  it("rejects an empty body", () => {
    expect(createCommentSchema.safeParse({ ...valid, body: "   " }).success).toBe(false);
  });

  it("rejects an unknown subjectType", () => {
    expect(createCommentSchema.safeParse({ ...valid, subjectType: "mystery" }).success).toBe(false);
  });

  it("strips a client-supplied teamId or authorId", () => {
    const parsed = createCommentSchema.parse({ ...valid, teamId: "team_x", authorId: "user_x" });
    expect(parsed).not.toHaveProperty("teamId");
    expect(parsed).not.toHaveProperty("authorId");
  });
});

describe("updateCommentSchema", () => {
  it("accepts a body change", () => {
    expect(updateCommentSchema.parse({ body: "edited" })).toEqual({ body: "edited" });
  });

  it("rejects unknown keys (strict)", () => {
    expect(updateCommentSchema.safeParse({ body: "x", subjectId: "y" }).success).toBe(false);
  });

  it("rejects an empty body", () => {
    expect(updateCommentSchema.safeParse({ body: "" }).success).toBe(false);
  });
});

describe("commentSchema", () => {
  it("parses a comment with nested replies", () => {
    const reply = {
      id: "c2",
      subjectType: "deck",
      subjectId: "deck_1",
      author: { userId: "u2", username: "bob", displayName: "Bob" },
      body: "reply",
      parentCommentId: "c1",
      archivedAt: null,
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
      replies: [],
    };
    const parent = {
      ...reply,
      id: "c1",
      body: "parent",
      parentCommentId: null,
      replies: [reply],
    };
    expect(commentSchema.parse(parent).replies).toHaveLength(1);
  });
});
