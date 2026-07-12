import { describe, expect, it } from "vitest";

import { parseMentionHandles, subjectTypeSchema } from "./collaboration.js";

describe("subjectTypeSchema", () => {
  it("accepts the adopted subject types", () => {
    expect(subjectTypeSchema.parse("deck")).toBe("deck");
    expect(subjectTypeSchema.parse("event")).toBe("event");
  });

  it("rejects an unknown subject type at the boundary", () => {
    expect(subjectTypeSchema.safeParse("card_test_suggestion").success).toBe(false);
    expect(subjectTypeSchema.safeParse("").success).toBe(false);
  });
});

describe("parseMentionHandles", () => {
  it("extracts a single @handle", () => {
    expect(parseMentionHandles("hey @alice can you look at this?")).toEqual(["alice"]);
  });

  it("extracts multiple handles and preserves order", () => {
    expect(parseMentionHandles("@alice and @bob-1 and @carol.j")).toEqual([
      "alice",
      "bob-1",
      "carol.j",
    ]);
  });

  it("deduplicates repeated handles, keeping the first occurrence", () => {
    expect(parseMentionHandles("@alice @bob @alice")).toEqual(["alice", "bob"]);
  });

  it("ignores an @ embedded in an email address", () => {
    expect(parseMentionHandles("mail me at bob@example.com please")).toEqual([]);
  });

  it("captures a handle at the very start of the body", () => {
    expect(parseMentionHandles("@alice hi")).toEqual(["alice"]);
  });

  it("returns an empty list when there are no mentions", () => {
    expect(parseMentionHandles("no mentions here")).toEqual([]);
    expect(parseMentionHandles("")).toEqual([]);
  });

  it("does not treat a bare @ as a handle", () => {
    expect(parseMentionHandles("just an @ symbol")).toEqual([]);
  });
});
