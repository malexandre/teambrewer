import { Body, Controller, Param, Patch, UseGuards } from "@nestjs/common";

import { type AdminUserSummary, setInstanceAdminSchema } from "@teambrewer/shared";

import { RequireInstanceAdmin } from "../common/roles.decorator.js";
import { RoleGuard } from "../common/role.guard.js";
import { AdminTeamsService } from "./admin-teams.service.js";

/** Instance-admin-only global user capability: set/clear the instance-admin flag. */
@Controller("admin/users")
@UseGuards(RoleGuard)
@RequireInstanceAdmin()
export class AdminInstanceUsersController {
  constructor(private readonly adminTeams: AdminTeamsService) {}

  @Patch(":userId")
  setInstanceAdmin(
    @Param("userId") userId: string,
    @Body() body: unknown,
  ): Promise<AdminUserSummary> {
    const { isInstanceAdmin } = setInstanceAdminSchema.parse(body);
    return this.adminTeams.setInstanceAdmin(userId, isInstanceAdmin);
  }
}
