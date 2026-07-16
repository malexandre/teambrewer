import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EventList } from "./EventList";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Render inside a router (event rows are <Link>s) and a query client. */
function renderInApp(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => ui });
  const eventRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/events/$eventId",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([eventRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const eventSummary = (overrides: Record<string, unknown>) => ({
  id: "event-1",
  name: "Calling: Sydney",
  gameId: "flesh-and-blood",
  date: "2026-09-12T00:00:00.000Z",
  location: "Sydney",
  goingCount: 0,
  interestedCount: 0,
  archivedAt: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
  ...overrides,
});

function mockApi(events: ReturnType<typeof eventSummary>[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/events")) {
      return json({ data: events, nextCursor: null });
    }
    return json({}, 404);
  });
}

describe("EventList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the going count on each event row", async () => {
    mockApi([
      eventSummary({ id: "event-1", name: "Calling: Sydney", goingCount: 4, interestedCount: 2 }),
      eventSummary({ id: "event-2", name: "Battle Hardened", goingCount: 0, interestedCount: 1 }),
    ]);
    renderInApp(<EventList teamId="team-1" />);

    expect(await screen.findByText("Calling: Sydney")).toBeInTheDocument();
    expect(screen.getByText("4 going")).toBeInTheDocument();
    expect(screen.getByText("0 going")).toBeInTheDocument();
  });
});
