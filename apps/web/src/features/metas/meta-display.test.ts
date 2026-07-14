import { describe, expect, it } from "vitest";

import { matchupSubjectDisplayName } from "./meta-display";

describe("matchupSubjectDisplayName", () => {
  it("joins the hero name and a non-empty label with a middle dot", () => {
    expect(matchupSubjectDisplayName("Dorinthea", "Aggro")).toBe("Dorinthea · Aggro");
  });

  it("shows the hero name alone when the label is empty or whitespace", () => {
    expect(matchupSubjectDisplayName("Dorinthea", "")).toBe("Dorinthea");
    expect(matchupSubjectDisplayName("Dorinthea", "   ")).toBe("Dorinthea");
  });

  it("shows the label alone when there is no hero (null or undefined)", () => {
    expect(matchupSubjectDisplayName(null, "Aggro Red")).toBe("Aggro Red");
    expect(matchupSubjectDisplayName(undefined, "Aggro Red")).toBe("Aggro Red");
  });
});
