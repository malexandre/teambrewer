import { describe, expect, it } from "vitest";

import {
  adminCreateUserSchema,
  adminUserSummarySchema,
  authMethodSchema,
  backupCodeSchema,
  loginSchema,
  passwordSchema,
  setInstanceAdminSchema,
  setupPasswordSchema,
  teamRoleSchema,
  totpCodeSchema,
  totpVerifySchema,
  usernameSchema,
} from "./auth.js";

describe("authMethodSchema", () => {
  it("accepts the two supported login methods", () => {
    expect(authMethodSchema.parse("password_totp")).toBe("password_totp");
    expect(authMethodSchema.parse("discord")).toBe("discord");
  });

  it("rejects an unknown method", () => {
    expect(() => authMethodSchema.parse("magic_link")).toThrow();
  });
});

describe("usernameSchema", () => {
  it("accepts a valid username", () => {
    expect(usernameSchema.parse("meta.caller_01")).toBe("meta.caller_01");
  });

  it("rejects too-short usernames", () => {
    expect(() => usernameSchema.parse("ab")).toThrow();
  });

  it("rejects usernames with spaces or illegal characters", () => {
    expect(() => usernameSchema.parse("bad name")).toThrow();
    expect(() => usernameSchema.parse("bad/name")).toThrow();
  });
});

describe("passwordSchema", () => {
  it("accepts a sufficiently long password", () => {
    expect(passwordSchema.parse("correct horse battery")).toBeTypeOf("string");
  });

  it("rejects a password shorter than 12 characters", () => {
    expect(() => passwordSchema.parse("short")).toThrow();
  });

  it("rejects a password longer than 128 characters", () => {
    expect(() => passwordSchema.parse("x".repeat(129))).toThrow();
  });
});

describe("totpCodeSchema", () => {
  it("accepts a 6-digit code", () => {
    expect(totpCodeSchema.parse("123456")).toBe("123456");
  });

  it("rejects codes that are not exactly six digits", () => {
    expect(() => totpCodeSchema.parse("12345")).toThrow();
    expect(() => totpCodeSchema.parse("1234567")).toThrow();
    expect(() => totpCodeSchema.parse("abcdef")).toThrow();
  });
});

describe("backupCodeSchema", () => {
  it("accepts a non-empty code", () => {
    expect(backupCodeSchema.parse("ABCD-EFGH")).toBe("ABCD-EFGH");
  });

  it("rejects an empty code", () => {
    expect(() => backupCodeSchema.parse("")).toThrow();
  });
});

describe("loginSchema", () => {
  it("parses username + password", () => {
    const parsed = loginSchema.parse({ username: "caller", password: "x" });
    expect(parsed).toEqual({ username: "caller", password: "x" });
  });

  it("rejects a blank password", () => {
    expect(() => loginSchema.parse({ username: "caller", password: "" })).toThrow();
  });
});

describe("totpVerifySchema", () => {
  it("parses a valid code", () => {
    expect(totpVerifySchema.parse({ code: "000111" })).toEqual({ code: "000111" });
  });
});

describe("setupPasswordSchema", () => {
  it("enforces the password policy on setup", () => {
    expect(() => setupPasswordSchema.parse({ password: "tooshort" })).toThrow();
    expect(setupPasswordSchema.parse({ password: "a-strong-passphrase" })).toEqual({
      password: "a-strong-passphrase",
    });
  });
});

describe("teamRoleSchema", () => {
  it("accepts the two per-team roles", () => {
    expect(teamRoleSchema.parse("team_admin")).toBe("team_admin");
    expect(teamRoleSchema.parse("member")).toBe("member");
  });

  it("rejects instance_admin as a team role", () => {
    expect(() => teamRoleSchema.parse("instance_admin")).toThrow();
  });
});

describe("adminCreateUserSchema", () => {
  it("parses a valid create-user payload without a body teamId (no method — the invitee chooses)", () => {
    const parsed = adminCreateUserSchema.parse({
      username: "newmember",
      displayName: "New Member",
      role: "member",
    });
    expect(parsed).toEqual({ username: "newmember", displayName: "New Member", role: "member" });
  });

  it("ignores any client-supplied teamId (scoping comes from context)", () => {
    const parsed = adminCreateUserSchema.parse({
      username: "newmember",
      displayName: "New Member",
      role: "team_admin",
      teamId: "team-should-be-ignored",
    });
    expect(parsed).not.toHaveProperty("teamId");
  });

  it("rejects a payload with an invalid role", () => {
    expect(() =>
      adminCreateUserSchema.parse({
        username: "newmember",
        displayName: "New Member",
        authMethod: "password_totp",
        role: "owner",
      }),
    ).toThrow();
  });
});

describe("setInstanceAdminSchema", () => {
  it("accepts a boolean flag", () => {
    expect(setInstanceAdminSchema.parse({ isInstanceAdmin: true })).toEqual({
      isInstanceAdmin: true,
    });
  });

  it("rejects a non-boolean flag", () => {
    expect(() => setInstanceAdminSchema.parse({ isInstanceAdmin: "yes" })).toThrow();
  });
});

describe("adminUserSummarySchema", () => {
  it("parses an admin-facing user summary with a nullable Discord username", () => {
    const parsed = adminUserSummarySchema.parse({
      id: "user-1",
      username: "alpha",
      displayName: "Alpha",
      authMethod: "password_totp",
      isInstanceAdmin: false,
      discordUsername: null,
    });
    expect(parsed.discordUsername).toBeNull();
  });
});
