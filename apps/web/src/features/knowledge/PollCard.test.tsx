import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Poll } from "@teambrewer/shared";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { PollCard } from "./PollCard";

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

function basePoll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: "poll-1",
    authorId: "user-1",
    author: { userId: "user-1", username: "alice", displayName: "Alice" },
    question: "Which deck for Nationals?",
    options: [
      { id: "opt-fai", label: "Fai" },
      { id: "opt-kano", label: "Kano" },
    ],
    status: "open",
    closesAt: null,
    results: [
      { optionId: "opt-fai", label: "Fai", count: 2, percentage: 67 },
      { optionId: "opt-kano", label: "Kano", count: 1, percentage: 33 },
    ],
    totalVotes: 3,
    myVoteOptionId: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    ...overrides,
  };
}

function mockApi(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.endsWith("/api/me")) return json(CURRENT_USER);
    throw new Error(`Unexpected request: ${url}`);
  });
}

function renderCard(ui: ReactNode) {
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

describe("PollCard", () => {
  it("renders the tally (counts + percentages) for each option", async () => {
    mockApi();
    renderCard(<PollCard teamId="team-1" poll={basePoll()} />);

    expect(await screen.findByText("Which deck for Nationals?")).toBeInTheDocument();
    expect(screen.getByText("Fai")).toBeInTheDocument();
    expect(screen.getByText("2 · 67%")).toBeInTheDocument();
    expect(screen.getByText("1 · 33%")).toBeInTheDocument();
    expect(screen.getByText(/3 votes/)).toBeInTheDocument();
  });

  it("disables voting when the poll is closed", async () => {
    mockApi();
    renderCard(<PollCard teamId="team-1" poll={basePoll({ status: "closed" })} />);

    await screen.findByText("Which deck for Nationals?");
    expect(screen.getByText("Closed")).toBeInTheDocument();
    // Each option is a button; on a closed poll they are all disabled.
    const faiButton = screen.getByRole("button", { name: /Fai/ });
    expect(faiButton).toBeDisabled();
  });

  it("highlights the caller's current vote", async () => {
    mockApi();
    renderCard(<PollCard teamId="team-1" poll={basePoll({ myVoteOptionId: "opt-fai" })} />);

    await screen.findByText("Which deck for Nationals?");
    const faiButton = screen.getByRole("button", { name: /Fai/ });
    expect(faiButton).toHaveAttribute("aria-pressed", "true");
  });
});
