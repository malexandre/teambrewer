import { Module } from "@nestjs/common";

import { LocalBootstrapService } from "./local-bootstrap.service.js";

/**
 * Wires the local-development bootstrap service. Its collaborators (`AuthService`,
 * `InviteTokenService`, `PrismaService`) come from the global auth/prisma modules,
 * so nothing needs importing here. The service is only ever resolved by the
 * `bootstrap:local` CLI entrypoint (main.bootstrap.ts) — it has no controller and
 * exposes no HTTP surface.
 */
@Module({
  providers: [LocalBootstrapService],
  exports: [LocalBootstrapService],
})
export class LocalBootstrapModule {}
