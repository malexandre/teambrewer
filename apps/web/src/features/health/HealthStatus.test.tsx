import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HealthStatus } from "./HealthStatus";

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockFetchResolving(body: unknown, status = 200) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("HealthStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the API status once the health check resolves", async () => {
    mockFetchResolving({ status: "ok" });

    renderWithClient(<HealthStatus />);

    expect(await screen.findByText(/api status: ok/i)).toBeInTheDocument();
  });

  it("shows an error state when the request fails", async () => {
    mockFetchResolving("unavailable", 500);

    renderWithClient(<HealthStatus />);

    expect(await screen.findByText(/api unavailable/i)).toBeInTheDocument();
  });
});
