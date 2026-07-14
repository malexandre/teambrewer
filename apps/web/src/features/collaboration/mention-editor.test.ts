import { describe, expect, it } from "vitest";

import {
  activeCardToken,
  activeMentionToken,
  CARD_PILL_ATTRIBUTE,
  createCardPill,
  serializeEditorRoot,
  setCardPillName,
} from "./mention-editor";

/** Build an editor root DOM from a spec of text / pill parts, as the composer does. */
function editorRootFrom(
  parts: Array<string | { cardId: string; name: string } | "br">,
): HTMLElement {
  const root = document.createElement("div");
  for (const part of parts) {
    if (part === "br") {
      root.appendChild(document.createElement("br"));
    } else if (typeof part === "string") {
      root.appendChild(document.createTextNode(part));
    } else {
      root.appendChild(createCardPill(document, part.cardId, part.name));
    }
  }
  return root;
}

describe("activeCardToken", () => {
  it("matches a `+query` run ending at the caret", () => {
    expect(activeCardToken("try +comm")).toEqual({ token: "comm", start: 5 });
  });

  it("allows spaces in the query (card names have them)", () => {
    expect(activeCardToken("play +command and")).toEqual({ token: "command and", start: 6 });
  });

  it("does not spill across a second `+`", () => {
    expect(activeCardToken("+[[cnc]] +daz")).toEqual({ token: "daz", start: 10 });
  });

  it("is null when there is no `+` run before the caret", () => {
    expect(activeCardToken("just prose")).toBeNull();
  });

  it("does not match a `+` glued to the end of a word", () => {
    expect(activeCardToken("a+b")).toBeNull();
  });
});

describe("activeMentionToken", () => {
  it("matches an `@handle` run ending at the caret", () => {
    expect(activeMentionToken("ping @ali")).toEqual({ token: "ali", start: 6 });
  });

  it("is null for an email-like mid-word @", () => {
    expect(activeMentionToken("mail me@host")).toBeNull();
  });
});

describe("createCardPill / setCardPillName", () => {
  it("creates an atomic, non-editable pill carrying the card id and `+name`", () => {
    const pill = createCardPill(document, "cnc", "Command and Conquer");
    expect(pill.getAttribute(CARD_PILL_ATTRIBUTE)).toBe("cnc");
    expect(pill.getAttribute("contenteditable")).toBe("false");
    expect(pill.textContent).toBe("+Command and Conquer");
  });

  it("relabels in place without changing the id", () => {
    const pill = createCardPill(document, "cnc", "…");
    setCardPillName(pill, "Command and Conquer");
    expect(pill.getAttribute(CARD_PILL_ATTRIBUTE)).toBe("cnc");
    expect(pill.textContent).toBe("+Command and Conquer");
  });
});

describe("serializeEditorRoot", () => {
  it("returns plain text verbatim", () => {
    expect(serializeEditorRoot(editorRootFrom(["hello world"]))).toBe("hello world");
  });

  it("serializes a pill to its `+[[cardId]]` token, keeping surrounding text", () => {
    const root = editorRootFrom(["try ", { cardId: "cnc", name: "Command and Conquer" }, " now"]);
    expect(serializeEditorRoot(root)).toBe("try +[[cnc]] now");
  });

  it("handles a leading pill and two adjacent pills", () => {
    const root = editorRootFrom([
      { cardId: "a", name: "Alpha" },
      { cardId: "b", name: "Beta" },
    ]);
    expect(serializeEditorRoot(root)).toBe("+[[a]]+[[b]]");
  });

  it("maps a <br> to a newline", () => {
    const root = editorRootFrom(["line one", "br", "line two"]);
    expect(serializeEditorRoot(root)).toBe("line one\nline two");
  });

  it("puts a browser-injected block wrapper on its own line", () => {
    const root = document.createElement("div");
    root.appendChild(document.createTextNode("first"));
    const block = document.createElement("div");
    block.appendChild(document.createTextNode("second"));
    root.appendChild(block);
    expect(serializeEditorRoot(root)).toBe("first\nsecond");
  });

  it("round-trips a body built from tokens back to itself", () => {
    const body = "sideboard +[[cnc]] vs control, ask @alice";
    // Rebuild the DOM the way the composer does, then serialize it.
    const root = editorRootFrom([
      "sideboard ",
      { cardId: "cnc", name: "Command and Conquer" },
      " vs control, ask @alice",
    ]);
    expect(serializeEditorRoot(root)).toBe(body);
  });
});
