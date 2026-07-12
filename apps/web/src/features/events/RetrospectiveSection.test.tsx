import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { RetrospectiveSection } from "./RetrospectiveSection";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const TEAM = {
  teamId: "team-1",
  name: "Alpha",
  slug: "alpha",
  gameId: "flesh-and-blood",
  role: "member" as const,
};

const CURRENT_USER = {
  id: "user-1",
  username: "alice",
  displayName: "Alice",
  isInstanceAdmin: false,
  authMethod: "password_totp",
  totpEnabled: true,
  discordUserId: null,
  discordUsername: null,
};

const retrospective = {
  id: "retro-1",
  eventId: "event-1",
  author: { userId: "user-1", username: "alice", displayName: "Alice" },
  body: "We went 5-2; the plan held up.",
  resultsSummary: "3rd of 32",
  learnings: "More interaction vs Briar.",
  archivedAt: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};

function mockApi(options: { exists: boolean }): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.endsWith("/api/me")) return json(CURRENT_USER);
    if (url.includes("/retrospective")) {
      return options.exists
        ? json(retrospective)
        : json({ error: { code: "NOT_FOUND", message: "Retrospective not found." } }, 404);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

function renderSection(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveTeamProvider>{ui}</ActiveTeamProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("RetrospectiveSection", () => {
  it("renders the body plus the results and learnings sections when one exists", async () => {
    mockApi({ exists: true });
    renderSection(<RetrospectiveSection teamId="team-1" eventId="event-1" />);

    expect(await screen.findByText(/went 5-2/)).toBeInTheDocument();
    expect(screen.getByText("Results")).toBeInTheDocument();
    expect(screen.getByText("3rd of 32")).toBeInTheDocument();
    expect(screen.getByText("Learnings")).toBeInTheDocument();
    expect(screen.getByText("More interaction vs Briar.")).toBeInTheDocument();
  });

  it("shows the write form (with results & learnings fields) when none has been written", async () => {
    mockApi({ exists: false });
    renderSection(<RetrospectiveSection teamId="team-1" eventId="event-1" />);

    expect(await screen.findByLabelText("Review")).toBeInTheDocument();
    expect(screen.getByLabelText("Results summary")).toBeInTheDocument();
    expect(screen.getByLabelText("Learnings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write retrospective" })).toBeInTheDocument();
  });
});
