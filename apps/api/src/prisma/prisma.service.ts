import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";

/**
 * Runtime Prisma client for the API. Prisma 7's engine-less `prisma-client`
 * generator requires a driver adapter, so the client is constructed with
 * `@prisma/adapter-pg` against `DATABASE_URL` (the URL is supplied at runtime,
 * not in schema.prisma — see prisma.config.ts and the Prisma 7 note in the
 * project memory).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set; cannot start the API.");
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Prisma connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
