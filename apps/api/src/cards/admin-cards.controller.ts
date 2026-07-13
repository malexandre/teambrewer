import { Controller, Post, UseGuards } from "@nestjs/common";

import { type CardSyncResponse } from "@teambrewer/shared";

import { RequireInstanceAdmin } from "../common/roles.decorator.js";
import { RoleGuard } from "../common/role.guard.js";
import { ExpensiveOperationRateLimit } from "../common/throttling.js";
import { CardSyncService } from "./card-sync.service.js";

/**
 * Instance-admin-only trigger for a card-data sync (global, not team-scoped).
 * Idempotent — safe to re-run; leaves prior data intact on source failure.
 */
@Controller("admin/card-data")
@UseGuards(RoleGuard)
@RequireInstanceAdmin()
export class AdminCardsController {
  constructor(private readonly cardSync: CardSyncService) {}

  // A full card-data sync hits the external source and bulk-upserts every card;
  // rate-limit it below the global default even though it is instance-admin-only.
  @Post("sync")
  @ExpensiveOperationRateLimit()
  async sync(): Promise<CardSyncResponse> {
    return { data: await this.cardSync.syncAll() };
  }
}
