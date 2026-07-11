import { type ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import type { RequestWithTenantContext } from "../tenancy/team-context.js";
import { RoleGuard } from "./role.guard.js";
import { REQUIRED_TEAM_ROLES_KEY, REQUIRE_INSTANCE_ADMIN_KEY } from "./roles.decorator.js";

function buildContext(request: Partial<RequestWithTenantContext>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function reflectorReturning(metadata: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
}

describe("RoleGuard", () => {
  it("rejects an unauthenticated request", () => {
    const guard = new RoleGuard(reflectorReturning({}));
    expect(() => guard.canActivate(buildContext({}))).toThrow(UnauthorizedException);
  });

  it("allows an instance-admin to satisfy any requirement", () => {
    const guard = new RoleGuard(reflectorReturning({ [REQUIRE_INSTANCE_ADMIN_KEY]: true }));
    const context = buildContext({ userId: "u1", isInstanceAdmin: true });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("denies a non-admin an instance-admin-only route", () => {
    const guard = new RoleGuard(reflectorReturning({ [REQUIRE_INSTANCE_ADMIN_KEY]: true }));
    const context = buildContext({ userId: "u1", isInstanceAdmin: false });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("denies a member a team-admin-only route", () => {
    const guard = new RoleGuard(reflectorReturning({ [REQUIRED_TEAM_ROLES_KEY]: ["team_admin"] }));
    const context = buildContext({
      userId: "u1",
      teamContext: { userId: "u1", teamId: "t1", role: "member" },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("allows a team-admin a team-admin-only route", () => {
    const guard = new RoleGuard(reflectorReturning({ [REQUIRED_TEAM_ROLES_KEY]: ["team_admin"] }));
    const context = buildContext({
      userId: "u1",
      teamContext: { userId: "u1", teamId: "t1", role: "team_admin" },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows a member a route open to members", () => {
    const guard = new RoleGuard(
      reflectorReturning({ [REQUIRED_TEAM_ROLES_KEY]: ["team_admin", "member"] }),
    );
    const context = buildContext({
      userId: "u1",
      teamContext: { userId: "u1", teamId: "t1", role: "member" },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows an authenticated request when no role metadata is present", () => {
    const guard = new RoleGuard(reflectorReturning({}));
    expect(guard.canActivate(buildContext({ userId: "u1" }))).toBe(true);
  });
});
