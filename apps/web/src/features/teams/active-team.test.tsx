import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "./active-team";
import { MembersPanel } from "./MembersPanel";
import { TeamSelector } from "./TeamSelector";

const teams = {
  data: [
    {
      teamId: "team-a",
      name: "Alpha Squad",
      slug: "alpha",
      gameId: "flesh-and-blood",
      role: "member",
    },
    {
      teamId: "team-b",
      name: "Bravo Squad",
      slug: "bravo",
      gameId: "flesh-and-blood",
      role: "member",
    },
  ],
};

const membersByTeam: Record<string, unknown> = {
  "team-a": {
    data: [
      {
        userId: "a1",
        username: "alpha_one",
        displayName: "Alpha One",
        role: "member",
        joinedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  },
  "team-b": {
    data: [
      {
        userId: "b1",
        username: "bravo_one",
        displayName: "Bravo One",
        role: "member",
        joinedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  },
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mockApi() {
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.endsWith("/api/me/teams")) {
      return Promise.resolve(jsonResponse(teams));
    }
    if (url.endsWith("/api/members")) {
      const headers = new Headers(init?.headers);
      const teamId = headers.get("x-team-id") ?? "";
      return Promise.resolve(jsonResponse(membersByTeam[teamId] ?? { data: [] }));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

function renderApp(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveTeamProvider>{ui}</ActiveTeamProvider>
    </QueryClientProvider>,
  );
}

describe("active team + roster isolation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("lists only the user's teams and shows the active team's members", async () => {
    mockApi();
    renderApp(
      <>
        <TeamSelector />
        <MembersPanel />
      </>,
    );

    const selector = await screen.findByRole("combobox", { name: /active team/i });
    expect(selector).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Alpha Squad" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bravo Squad" })).toBeInTheDocument();

    // Defaults to the first team and shows only its members.
    expect(await screen.findByText("Alpha One")).toBeInTheDocument();
    expect(screen.queryByText("Bravo One")).not.toBeInTheDocument();
  });

  it("switching teams shows only the new team's members (no cache bleed)", async () => {
    mockApi();
    renderApp(
      <>
        <TeamSelector />
        <MembersPanel />
      </>,
    );

    await screen.findByText("Alpha One");
    const selector = await screen.findByRole("combobox", { name: /active team/i });
    await userEvent.selectOptions(selector, "team-b");

    expect(await screen.findByText("Bravo One")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Alpha One")).not.toBeInTheDocument();
    });
  });
});
