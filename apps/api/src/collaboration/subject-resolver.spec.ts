import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import type { TeamContext } from "../tenancy/team-context.js";
import { type AttachableSubjectResolver, SubjectResolverRegistry } from "./subject-resolver.js";

const team: TeamContext = {
  userId: "user_1",
  teamId: "team_1",
  role: "member",
  gameId: "flesh-and-blood",
};

function resolverFor(
  subjectType: string,
  resolve: AttachableSubjectResolver["resolve"],
): AttachableSubjectResolver {
  return { subjectType, resolve };
}

describe("SubjectResolverRegistry", () => {
  it("rejects an unregistered subject type with 404", async () => {
    const registry = new SubjectResolverRegistry();
    await expect(registry.requireSubject(team, "mystery", "id_1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects a subject the resolver cannot find (foreign team) with 404", async () => {
    const registry = new SubjectResolverRegistry();
    registry.register(resolverFor("deck", async () => null));
    await expect(registry.requireSubject(team, "deck", "id_1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("returns the resolved subject when the resolver finds it", async () => {
    const registry = new SubjectResolverRegistry();
    registry.register(resolverFor("deck", async () => ({ canComment: true, isTeamVisible: true })));
    await expect(registry.requireSubject(team, "deck", "id_1")).resolves.toEqual({
      canComment: true,
      isTeamVisible: true,
    });
  });

  it("passes the verified team and subject id through to the resolver", async () => {
    const registry = new SubjectResolverRegistry();
    let seen: { teamId: string; subjectId: string } | null = null;
    registry.register(
      resolverFor("deck", async (resolveTeam, subjectId) => {
        seen = { teamId: resolveTeam.teamId, subjectId };
        return { canComment: false, isTeamVisible: true };
      }),
    );
    await registry.requireSubject(team, "deck", "deck_42");
    expect(seen).toEqual({ teamId: "team_1", subjectId: "deck_42" });
  });

  it("reports whether a subject type is registered", () => {
    const registry = new SubjectResolverRegistry();
    expect(registry.has("deck")).toBe(false);
    registry.register(resolverFor("deck", async () => ({ canComment: true, isTeamVisible: true })));
    expect(registry.has("deck")).toBe(true);
  });
});
