import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { LocalBootstrapService } from "./bootstrap/local-bootstrap.service.js";

/**
 * `bootstrap:local` entrypoint. Boots a headless context and ensures the local
 * instance-admin exists (identity from SEED_ADMIN_USERNAME / SEED_ADMIN_DISPLAY_NAME),
 * printing the single-use setup link to open — or a sign-in note if onboarding is
 * already done. Idempotent; run by `pnpm start` (scripts/start-local.mjs).
 *
 * Emits a machine-parseable `SETUP_LINK=<url>` line the orchestrator captures, in
 * addition to the human-readable summary.
 */
async function runBootstrap(): Promise<void> {
  const application = await NestFactory.createApplicationContext(AppModule, {
    logger: ["warn", "error"],
  });
  try {
    const service = application.get(LocalBootstrapService);
    const result = await service.bootstrapInstanceAdmin(
      LocalBootstrapService.optionsFromEnvironment(),
    );

    if (result.promotedToInstanceAdmin) {
      console.log(`Promoted existing user "${result.username}" to instance-admin.`);
    }

    if (result.status === "already_provisioned") {
      console.log(
        `Instance-admin "${result.username}" is already set up. Sign in at ${result.signInUrl}`,
      );
      return;
    }

    console.log(
      result.createdNewUser
        ? `Created instance-admin "${result.username}" (${result.displayName}).`
        : `Instance-admin "${result.username}" has no password yet; issued a fresh setup link.`,
    );
    console.log(`This link expires ${result.link.expiresAt} and can be used once.`);
    // Machine-parseable line for the orchestrator (scripts/start-local.mjs).
    console.log(`SETUP_LINK=${result.link.url}`);
  } finally {
    await application.close();
  }
}

runBootstrap()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Bootstrap failed:", error);
    process.exit(1);
  });
