import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { ReferenceDataSeedService } from "./cards/reference-data-seed.service.js";

/**
 * `db:seed` entrypoint. Boots a headless context and seeds the network-free
 * reference catalog (games + formats). Idempotent — safe to run repeatedly. Run
 * `card:sync` afterwards to populate cards and heroes from the dataset.
 */
async function runSeed(): Promise<void> {
  const application = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });
  try {
    const result = await application.get(ReferenceDataSeedService).seed();
    console.log(`Seeded ${result.gamesSeeded} game(s) and ${result.formatsSeeded} format(s).`);
  } finally {
    await application.close();
  }
}

runSeed()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
