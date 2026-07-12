import { Module } from "@nestjs/common";

import { AdminModule } from "../admin/admin.module.js";
import { RoleGuard } from "../common/role.guard.js";
import { TenancyModule } from "../tenancy/tenancy.module.js";
import { MembersController } from "./members.controller.js";
import { MeController } from "./me.controller.js";
import { MeService } from "./me.service.js";

/**
 * Self-service (`/api/me`) and the member-facing roster (`/api/members`). Imports
 * TenancyModule for the header-based TeamContextGuard and AdminModule for
 * MembershipService. The public onboarding endpoints live in OnboardingModule.
 */
@Module({
  imports: [TenancyModule, AdminModule],
  controllers: [MeController, MembersController],
  providers: [MeService, RoleGuard],
})
export class MeModule {}
