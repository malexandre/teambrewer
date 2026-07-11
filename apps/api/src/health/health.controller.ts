import { Controller, Get } from "@nestjs/common";
import { healthResponseSchema, type HealthResponse } from "@teambrewer/shared";

@Controller("health")
export class HealthController {
  @Get()
  check(): HealthResponse {
    // Parse our own response against the shared schema so a drift between the
    // contract and what we return fails loudly rather than silently.
    return healthResponseSchema.parse({ status: "ok" });
  }
}
