import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { configureApp } from "./app.setup.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  // Locked to the web app origin; credentials allowed for the cookie-based
  // session auth that lands in phase-01 (see docs/architecture/security.md).
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
  app.enableCors({ origin: webOrigin, credentials: true });

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
