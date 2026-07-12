import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { AdminModule } from "./admin/admin.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CardsModule } from "./cards/cards.module.js";
import { CollaborationModule } from "./collaboration/collaboration.module.js";
import { DecksModule } from "./decks/decks.module.js";
import { DomainExceptionFilter } from "./common/domain-exception.filter.js";
import { THROTTLER_OPTIONS } from "./common/throttling.js";
import { DiscordModule } from "./discord/discord.module.js";
import { EventsModule } from "./events/events.module.js";
import { HealthModule } from "./health/health.module.js";
import { MeModule } from "./me/me.module.js";
import { OnboardingModule } from "./onboarding/onboarding.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { TenancyModule } from "./tenancy/tenancy.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot(THROTTLER_OPTIONS),
    PrismaModule,
    AuthModule,
    TenancyModule,
    AdminModule,
    MeModule,
    OnboardingModule,
    DiscordModule,
    HealthModule,
    CardsModule,
    DecksModule,
    EventsModule,
    CollaborationModule,
  ],
  providers: [
    // The uniform error envelope (api-conventions.md) is applied to every route.
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    // Rate limiting (security.md); sensitive routes tighten it with StrictRateLimit.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
