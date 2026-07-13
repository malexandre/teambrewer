import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { ReactNode } from "react";

import { queryCachePersister, shouldDehydrateQuery } from "@/app/query-persistence";
import { ThemeProvider } from "@/app/theme";

// Entries must outlive the default 5-minute GC to be worth persisting for offline
// reads; a week covers the "away at a tournament" gap. staleTime stays 0 so the
// app's explicit invalidation still drives freshness when online.
const OFFLINE_CACHE_MAX_AGE_MILLISECONDS = 1000 * 60 * 60 * 24 * 7;

// Bump to discard incompatible persisted caches after a shape change.
const PERSISTED_CACHE_BUSTER = "v1";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Server state is refetched deliberately via query invalidation; avoid
      // surprise refetches on window focus in an internal tool.
      refetchOnWindowFocus: false,
      gcTime: OFFLINE_CACHE_MAX_AGE_MILLISECONDS,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryCachePersister,
        maxAge: OFFLINE_CACHE_MAX_AGE_MILLISECONDS,
        buster: PERSISTED_CACHE_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery },
      }}
    >
      <ThemeProvider>{children}</ThemeProvider>
    </PersistQueryClientProvider>
  );
}
