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

import { MetaList } from "./MetaList";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Render inside a router (MetaList rows are <Link>s) and a query client. */
function renderInApp(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => ui });
  const metaRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/metas/$metaId",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([metaRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const summer = {
  id: "meta-summer",
  name: "Summer Season",
  formatId: "fmt-cc",
  formatName: "Classic Constructed",
  startDate: "2026-06-01T00:00:00.000Z",
  endDate: "2026-08-31T00:00:00.000Z",
  archivedAt: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};
const spring = {
  id: "meta-spring",
  name: "Spring Season",
  formatId: "fmt-cc",
  formatName: "Classic Constructed",
  startDate: "2026-03-01T00:00:00.000Z",
  endDate: "2026-05-31T00:00:00.000Z",
  archivedAt: null,
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
};

function mockMetas(options: { currentIsSummer: boolean }) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/metas/current")) {
      return options.currentIsSummer ? json({ ...summer, description: "" }) : json({}, 404);
    }
    if (url.includes("/api/metas")) {
      return json({ data: [summer, spring], nextCursor: null });
    }
    return json({}, 404);
  });
}

describe("MetaList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("excludes the current meta and heads the section 'Other metas'", async () => {
    mockMetas({ currentIsSummer: true });
    renderInApp(<MetaList teamId="team-1" />);

    expect(await screen.findByRole("heading", { name: /other metas/i })).toBeInTheDocument();
    // The current meta (Summer) is surfaced by the page's callout, not this list.
    expect(await screen.findByText("Spring Season")).toBeInTheDocument();
    expect(screen.queryByText("Summer Season")).not.toBeInTheDocument();
  });

  it("lists every meta under 'All metas' when none is current", async () => {
    mockMetas({ currentIsSummer: false });
    renderInApp(<MetaList teamId="team-1" />);

    expect(await screen.findByRole("heading", { name: /all metas/i })).toBeInTheDocument();
    expect(await screen.findByText("Summer Season")).toBeInTheDocument();
    expect(await screen.findByText("Spring Season")).toBeInTheDocument();
  });
});
