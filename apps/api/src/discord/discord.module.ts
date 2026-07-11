import { Module } from "@nestjs/common";

import { RoleGuard } from "../common/role.guard.js";
import { DISCORD_OAUTH_CLIENT, DiscordOAuthHttpClient } from "./discord-oauth.client.js";
import { DiscordOAuthController } from "./discord-oauth.controller.js";
import { DiscordOAuthService } from "./discord-oauth.service.js";

/**
 * Discord OAuth transport (claim + identity link). The account rules live in the
 * AuthModule's DiscordAccountService (global); this wires the HTTP client and the
 * redirect endpoints. Swap {@link DISCORD_OAUTH_CLIENT} for a fake in tests.
 */
@Module({
  controllers: [DiscordOAuthController],
  providers: [
    DiscordOAuthService,
    RoleGuard,
    { provide: DISCORD_OAUTH_CLIENT, useClass: DiscordOAuthHttpClient },
  ],
})
export class DiscordModule {}
