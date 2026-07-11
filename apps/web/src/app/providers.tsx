import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/app/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Server state is refetched deliberately via query invalidation; avoid
      // surprise refetches on window focus in an internal tool.
      refetchOnWindowFocus: false,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
