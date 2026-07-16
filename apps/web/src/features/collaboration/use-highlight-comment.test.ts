import { describe, expect, it } from "vitest";

import { parseCommentHash } from "./use-highlight-comment";

describe("parseCommentHash", () => {
  it("reads the comment id from a #comment-<id> hash", () => {
    expect(parseCommentHash("#comment-c1")).toBe("c1");
  });

  it("tolerates a hash with no leading #", () => {
    expect(parseCommentHash("comment-c1")).toBe("c1");
  });

  it("ignores unrelated hashes and empty targets", () => {
    expect(parseCommentHash("#section-overview")).toBeUndefined();
    expect(parseCommentHash("#comment-")).toBeUndefined();
    expect(parseCommentHash("")).toBeUndefined();
    expect(parseCommentHash(undefined)).toBeUndefined();
  });
});
