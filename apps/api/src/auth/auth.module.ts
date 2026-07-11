import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AuthService } from "./auth.service.js";
import { AuthenticationGuard } from "./authentication.guard.js";
import { InviteTokenService } from "./invite-token.service.js";

/**
 * Authentication (Better Auth). Global so `AuthService` and `InviteTokenService`
 * are injectable everywhere, and registers the `AuthenticationGuard` as a global
 * guard so every request resolves its session (populating `userId`) before the
 * per-route authorization guards run.
 */
@Global()
@Module({
  providers: [
    AuthService,
    InviteTokenService,
    { provide: APP_GUARD, useClass: AuthenticationGuard },
  ],
  exports: [AuthService, InviteTokenService],
})
export class AuthModule {}
