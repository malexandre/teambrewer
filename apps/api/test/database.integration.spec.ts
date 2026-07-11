import type { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "./database.js";

describe("database harness (integration)", () => {
  let client: Client;

  beforeAll(async () => {
    client = createDatabaseClient();
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await resetDatabase(client);
  });

  it("applies the baseline migration to the ephemeral database", async () => {
    const result = await client.query<{ migration_name: string }>(
      "SELECT migration_name FROM _prisma_migrations ORDER BY started_at",
    );

    expect(result.rows.map((row) => row.migration_name)).toContain("0_init");
  });

  it("exposes a queryable connection to the ephemeral Postgres", async () => {
    const result = await client.query<{ result: number }>("SELECT 1 AS result");

    expect(result.rows[0]?.result).toBe(1);
  });
});
