import { Client } from "pg";
import { inject } from "vitest";

/**
 * A raw Postgres client pointed at the ephemeral Testcontainers database. Used
 * by integration tests to assert on schema/data directly. The application's own
 * Prisma-based data access (via a driver adapter) lands with the first domain
 * models in phase-01.
 */
export function createDatabaseClient(): Client {
  return new Client({ connectionString: inject("databaseUrl") });
}

/**
 * Truncate every application table (the public schema minus Prisma's own
 * bookkeeping) so each test starts from a clean slate. There are no domain
 * tables until phase-01; this establishes the reset-between-tests pattern now.
 */
export async function resetDatabase(client: Client): Promise<void> {
  const result = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );

  if (result.rows.length === 0) {
    return;
  }

  const tables = result.rows.map((row) => `"public"."${row.tablename}"`).join(", ");
  await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
