import { describe, expect, it } from "vitest";

import {
  createMembershipSchema,
  createTeamSchema,
  myTeamsResponseSchema,
  teamMembershipSummarySchema,
  updateMembershipSchema,
} from "./teams.js";

describe("createTeamSchema", () => {
  it("parses a team with a required game and optional first admin", () => {
    const parsed = createTeamSchema.parse({
      name: "Skirmish Squad",
      gameId: "flesh-and-blood",
      firstAdminUserId: "user-1",
    });
    expect(parsed.gameId).toBe("flesh-and-blood");
    expect(parsed.firstAdminUserId).toBe("user-1");
  });

  it("allows omitting the first admin", () => {
    const parsed = createTeamSchema.parse({
      name: "Skirmish Squad",
      gameId: "flesh-and-blood",
    });
    expect(parsed.firstAdminUserId).toBeUndefined();
  });

  it("rejects a team with no game", () => {
    expect(() => createTeamSchema.parse({ name: "Skirmish Squad", gameId: "" })).toThrow();
  });
});

describe("createMembershipSchema", () => {
  it("parses a membership by userId and role", () => {
    expect(createMembershipSchema.parse({ userId: "user-1", role: "member" })).toEqual({
      userId: "user-1",
      role: "member",
    });
  });

  it("parses a membership by username and role", () => {
    expect(createMembershipSchema.parse({ username: "alice", role: "member" })).toEqual({
      username: "alice",
      role: "member",
    });
  });

  it("rejects a membership identifying neither a userId nor a username", () => {
    expect(() => createMembershipSchema.parse({ role: "member" })).toThrow();
  });

  it("rejects a membership giving both a userId and a username", () => {
    expect(() =>
      createMembershipSchema.parse({ userId: "user-1", username: "alice", role: "member" }),
    ).toThrow();
  });
});

describe("updateMembershipSchema", () => {
  it("parses a role change", () => {
    expect(updateMembershipSchema.parse({ role: "team_admin" })).toEqual({
      role: "team_admin",
    });
  });
});

describe("teamMembershipSummarySchema / myTeamsResponseSchema", () => {
  it("parses a team the user belongs to with their role", () => {
    const summary = teamMembershipSummarySchema.parse({
      teamId: "team-1",
      name: "Skirmish Squad",
      slug: "skirmish-squad",
      gameId: "flesh-and-blood",
      role: "member",
    });
    expect(summary.role).toBe("member");
  });

  it("parses the my-teams response envelope", () => {
    const response = myTeamsResponseSchema.parse({
      data: [
        {
          teamId: "team-1",
          name: "Skirmish Squad",
          slug: "skirmish-squad",
          gameId: "flesh-and-blood",
          role: "team_admin",
        },
      ],
    });
    expect(response.data).toHaveLength(1);
  });
});
