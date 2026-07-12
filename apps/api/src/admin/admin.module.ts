import { Module } from "@nestjs/common";

import { RoleGuard } from "../common/role.guard.js";
import { TeamAdminGuard } from "../common/team-admin.guard.js";
import { AdminInstanceUsersController } from "./admin-instance-users.controller.js";
import { AdminMembershipController } from "./admin-membership.controller.js";
import { AdminTeamsController } from "./admin-teams.controller.js";
import { AdminTeamsService } from "./admin-teams.service.js";
import { AdminUsersController } from "./admin-users.controller.js";
import { AdminUsersService } from "./admin-users.service.js";
import { MembershipService } from "./membership.service.js";

/**
 * Instance-admin and team-admin management surface (Option C: admin routes carry
 * the target team in the path and are authorized by RoleGuard / TeamAdminGuard,
 * so an instance-admin manages any team without a membership while the
 * member-facing tenant guard keeps no bypass — see phase-01 admin-tenancy note).
 */
@Module({
  controllers: [
    AdminTeamsController,
    AdminInstanceUsersController,
    AdminUsersController,
    AdminMembershipController,
  ],
  providers: [AdminTeamsService, AdminUsersService, MembershipService, RoleGuard, TeamAdminGuard],
  // MembershipService backs the member-facing roster (GET /api/members) too.
  exports: [MembershipService],
})
export class AdminModule {}
