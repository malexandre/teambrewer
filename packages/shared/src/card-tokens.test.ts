import { describe, expect, it } from "vitest";

import { formatCardToken, parseCardTokens, tokenizeCardBody } from "./card-tokens.js";

describe("formatCardToken", () => {
  it("wraps a card id in the token delimiters", () => {
    expect(formatCardToken("abc")).toBe("+[[abc]]");
  });

  it("round-trips through parseCardTokens", () => {
    expect(parseCardTokens(formatCardToken("card_123"))).toEqual(["card_123"]);
  });
});

describe("parseCardTokens", () => {
  it("returns distinct card ids in first-seen order", () => {
    const body = `Try ${formatCardToken("y")} after ${formatCardToken("x")}`;
    expect(parseCardTokens(body)).toEqual(["y", "x"]);
  });

  it("dedupes repeated ids", () => {
    const body = `${formatCardToken("x")} then ${formatCardToken("x")} then ${formatCardToken("y")}`;
    expect(parseCardTokens(body)).toEqual(["x", "y"]);
  });

  it("ignores a plain + and malformed tokens", () => {
    expect(parseCardTokens("a + b, c +[[ ]] d, e +[[unclosed f")).toEqual([]);
  });

  it("returns an empty array for a body with no tokens", () => {
    expect(parseCardTokens("no cards here")).toEqual([]);
  });
});

describe("tokenizeCardBody", () => {
  it("splits text and card segments in order", () => {
    const body = `before ${formatCardToken("x")} after`;
    expect(tokenizeCardBody(body)).toEqual([
      { type: "text", text: "before " },
      { type: "card", cardId: "x" },
      { type: "text", text: " after" },
    ]);
  });

  it("omits empty text between adjacent tokens", () => {
    const body = `${formatCardToken("a")}${formatCardToken("b")}`;
    expect(tokenizeCardBody(body)).toEqual([
      { type: "card", cardId: "a" },
      { type: "card", cardId: "b" },
    ]);
  });

  it("reproduces the original body by concatenating the segments", () => {
    const body = `swap ${formatCardToken("x")} for ${formatCardToken("y")} soon`;
    const reconstructed = tokenizeCardBody(body)
      .map((segment) => (segment.type === "text" ? segment.text : formatCardToken(segment.cardId)))
      .join("");
    expect(reconstructed).toBe(body);
  });

  it("returns a single text segment when there are no tokens", () => {
    expect(tokenizeCardBody("just prose")).toEqual([{ type: "text", text: "just prose" }]);
  });
});
