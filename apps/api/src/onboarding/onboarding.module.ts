import { Module } from "@nestjs/common";

import { OnboardingController } from "./onboarding.controller.js";
import { OnboardingService } from "./onboarding.service.js";

/**
 * Public link-consumption endpoints (`/api/onboarding/*`): a new user setting their
 * password from a setup link, resetting it, or claiming a Discord account. Its
 * dependencies (AuthService, InviteTokenService, PrismaService) come from the
 * global AuthModule/PrismaModule, so this module declares no imports.
 */
@Module({
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
