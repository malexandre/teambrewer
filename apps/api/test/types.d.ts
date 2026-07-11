// Types shared by the Vitest global setup and the integration tests it feeds.
declare module "vitest" {
  interface ProvidedContext {
    // Connection string for the ephemeral Testcontainers Postgres, published by
    // test/global-setup.ts and read by tests via inject("databaseUrl").
    databaseUrl: string;
  }
}

export {};
