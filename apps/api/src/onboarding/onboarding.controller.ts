import { Body, Controller, Param, Post } from "@nestjs/common";

import {
  type OnboardingResult,
  resetPasswordSchema,
  setupPasswordSchema,
} from "@teambrewer/shared";

import { StrictRateLimit } from "../common/throttling.js";
import { OnboardingService } from "./onboarding.service.js";

/**
 * Public link-consumption endpoints. These live under `/api/onboarding/*` rather
 * than `/api/auth/*` because Better Auth owns the entire `/api/auth/*` namespace
 * (mounted as an Express handler in main.ts). No guard: authorization is the
 * possession of the single-use, hashed, expiring token itself.
 */
@Controller("onboarding")
@StrictRateLimit()
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post("setup/:token")
  setup(@Param("token") token: string, @Body() body: unknown): Promise<OnboardingResult> {
    const { password } = setupPasswordSchema.parse(body);
    return this.onboarding.completeSetup(token, password);
  }

  @Post("reset/:token")
  reset(@Param("token") token: string, @Body() body: unknown): Promise<OnboardingResult> {
    const { password } = resetPasswordSchema.parse(body);
    return this.onboarding.completeReset(token, password);
  }
}
