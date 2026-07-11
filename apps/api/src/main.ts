import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { toNodeHandler } from "better-auth/node";
import express from "express";

import { AppModule } from "./app.module.js";
import { configureApp } from "./app.setup.js";
import { AuthService } from "./auth/auth.service.js";

async function bootstrap(): Promise<void> {
  // Body parsing is disabled globally so Better Auth can read the raw request
  // body; JSON parsing is re-added below for every non-auth route.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  configureApp(app);

  // Locked to the web app origin; credentials allowed for the cookie-based
  // session auth (see docs/architecture/security.md).
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
  app.enableCors({ origin: webOrigin, credentials: true });

  // Mount Better Auth's handlers at /api/auth/* BEFORE the JSON body parser so
  // it receives the raw body; then parse JSON for TeamBrewer's own routes.
  const authService = app.get(AuthService);
  const expressInstance = app.getHttpAdapter().getInstance();
  expressInstance.all(/^\/api\/auth\//, toNodeHandler(authService.instance));
  expressInstance.use(express.json());
  expressInstance.use(express.urlencoded({ extended: true }));

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
