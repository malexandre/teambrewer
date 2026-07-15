import { describe, expect, it } from "vitest";

import { discordPlaceholderEmail } from "./auth.js";

describe("discordPlaceholderEmail", () => {
  it("synthesizes a stable, non-routable email from the Discord user id", () => {
    expect(discordPlaceholderEmail("123456789012345678")).toBe(
      "123456789012345678@discord.users.teambrewer.local",
    );
  });

  it("is deterministic per Discord id and distinct across ids", () => {
    expect(discordPlaceholderEmail("111")).toBe(discordPlaceholderEmail("111"));
    expect(discordPlaceholderEmail("111")).not.toBe(discordPlaceholderEmail("222"));
  });

  it("uses a distinct subdomain from provisioned users' synthetic email so the OAuth email fallback cannot match a real account", () => {
    // Provisioned accounts use `<username>@users.teambrewer.local`; the Discord
    // placeholder lives under `@discord.users.teambrewer.local`, so Better Auth's
    // email-fallback lookup can never resolve a provisioned user by this value.
    expect(discordPlaceholderEmail("123")).not.toContain("@users.teambrewer.local");
    expect(discordPlaceholderEmail("123")).toMatch(/@discord\.users\.teambrewer\.local$/);
  });
});
