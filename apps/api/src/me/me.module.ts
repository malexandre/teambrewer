import { Module } from "@nestjs/common";

import { AdminModule } from "../admin/admin.module.js";
import { RoleGuard } from "../common/role.guard.js";
import { TenancyModule } from "../tenancy/tenancy.module.js";
import { MembersController } from "./members.controller.js";
import { MeController } from "./me.controller.js";
import { MeService } from "./me.service.js";
import { OnboardingController } from "../onboarding/onboarding.controller.js";
import { OnboardingService } from "../onboarding/onboarding.service.js";

/**
 * Self-service (`/api/me`), the member-facing roster (`/api/members`), and the
 * public link-consumption endpoints (`/api/onboarding/*`). Imports TenancyModule
 * for the header-based TeamContextGuard and AdminModule for MembershipService.
 */
@Module({
  imports: [TenancyModule, AdminModule],
  controllers: [MeController, MembersController, OnboardingController],
  providers: [MeService, OnboardingService, RoleGuard],
})
export class MeModule {}
