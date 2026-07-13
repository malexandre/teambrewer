import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { AdminModule } from "./admin/admin.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { LocalBootstrapModule } from "./bootstrap/local-bootstrap.module.js";
import { CardsModule } from "./cards/cards.module.js";
import { CollaborationModule } from "./collaboration/collaboration.module.js";
import { DecksModule } from "./decks/decks.module.js";
import { DomainExceptionFilter } from "./common/domain-exception.filter.js";
import { OriginCheckGuard } from "./common/origin-check.guard.js";
import { THROTTLER_OPTIONS } from "./common/throttling.js";
import { DiscordModule } from "./discord/discord.module.js";
import { EventsModule } from "./events/events.module.js";
import { GameConfigModule } from "./game-config/game-config.module.js";
import { GamePlansModule } from "./game-plans/game-plans.module.js";
import { GameLogsModule } from "./game-logs/game-logs.module.js";
import { HealthModule } from "./health/health.module.js";
import { MeModule } from "./me/me.module.js";
import { OnboardingModule } from "./onboarding/onboarding.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { TenancyModule } from "./tenancy/tenancy.module.js";
import { TestingQueueModule } from "./testing-queue/testing-queue.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot(THROTTLER_OPTIONS),
    PrismaModule,
    AuthModule,
    LocalBootstrapModule,
    TenancyModule,
    AdminModule,
    MeModule,
    OnboardingModule,
    DiscordModule,
    HealthModule,
    CardsModule,
    DecksModule,
    EventsModule,
    GameConfigModule,
    GameLogsModule,
    CollaborationModule,
    TestingQueueModule,
    GamePlansModule,
  ],
  providers: [
    // The uniform error envelope (api-conventions.md) is applied to every route.
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    // Rate limiting (security.md); sensitive routes tighten it with StrictRateLimit.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // CSRF belt-and-braces: reject cross-origin cookie-authenticated mutations.
    { provide: APP_GUARD, useClass: OriginCheckGuard },
  ],
})
export class AppModule {}
