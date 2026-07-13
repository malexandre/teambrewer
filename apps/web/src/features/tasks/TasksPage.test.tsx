import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { TasksPage } from "./TasksPage";

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

const task = (overrides: Record<string, unknown>) => ({
  id: "t1",
  title: "Test Bravado over Sink Below",
  description: "Try +[[card-x]] in go-wide.",
  deckId: null,
  deckName: null,
  author: { userId: "user-1", username: "alice", displayName: "Alice" },
  assignee: null,
  status: "proposed",
  report: "",
  voteCount: 2,
  viewerHasVoted: true,
  archivedAt: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
  ...overrides,
});

/** Records the assignee filter the list requested, so the scope toggle is observable. */
function mockApi(): { assigneeQueries: (string | null)[] } {
  const assigneeQueries: (string | null)[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.endsWith("/api/me")) return json(CURRENT_USER);
    if (url.includes("/api/members")) {
      return json({
        data: [
          {
            userId: "user-1",
            username: "alice",
            displayName: "Alice",
            role: "member",
            joinedAt: "2026-07-12T00:00:00.000Z",
          },
        ],
      });
    }
    if (url.includes("/api/decks")) return json({ data: [], nextCursor: null });
    if (url.includes("/api/cards/card-x")) {
      return json({ id: "card-x", name: "Bravado", pitch: 3, imageUrl: null });
    }
    if (url.includes("/api/tasks")) {
      assigneeQueries.push(new URL(url, "http://x").searchParams.get("assigneeId"));
      return json({
        data: [
          task({ id: "t1", status: "proposed" }),
          task({
            id: "t2",
            title: "Finished tuning",
            description: "",
            status: "finished",
            report: "Went 8-2; adopting.",
            author: { userId: "user-2", username: "bob", displayName: "Bob" },
            viewerHasVoted: false,
            voteCount: 5,
          }),
        ],
        nextCursor: null,
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  return { assigneeQueries };
}

function renderPage(ui: ReactNode) {
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

describe("TasksPage", () => {
  it("groups tasks by status with counts and resolves +card tokens to chips", async () => {
    mockApi();
    renderPage(<TasksPage />);

    expect(await screen.findByText("Proposed (1)")).toBeInTheDocument();
    expect(screen.getByText("Finished (1)")).toBeInTheDocument();
    expect(screen.getByText("Test Bravado over Sink Below")).toBeInTheDocument();
    // The +[[card-x]] token renders as the card chip "+Bravado".
    expect(await screen.findByText("+Bravado")).toBeInTheDocument();
  });

  it("reflects the viewer's vote on the vote control", async () => {
    mockApi();
    renderPage(<TasksPage />);

    const retract = await screen.findByRole("button", { name: "Retract upvote" });
    expect(retract).toHaveAttribute("aria-pressed", "true");
    const upvote = screen.getByRole("button", { name: "Upvote" });
    expect(upvote).toHaveAttribute("aria-pressed", "false");
  });

  it("narrows to the viewer's tasks when the 'Assigned to me' scope is chosen", async () => {
    const { assigneeQueries } = mockApi();
    renderPage(<TasksPage />);

    await screen.findByText("Proposed (1)");
    await userEvent.click(screen.getByRole("button", { name: "Assigned to me" }));
    await waitFor(() => expect(assigneeQueries).toContain("user-1"));
  });

  it("reveals a finished task's report behind the Report toggle", async () => {
    mockApi();
    renderPage(<TasksPage />);

    await screen.findByText("Finished (1)");
    expect(screen.queryByText("Went 8-2; adopting.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByText("Went 8-2; adopting.")).toBeInTheDocument();
  });

  it("reveals the task form when creating", async () => {
    mockApi();
    renderPage(<TasksPage />);

    await screen.findByText("Proposed (1)");
    await userEvent.click(screen.getByRole("button", { name: "New task" }));
    expect(screen.getByLabelText("Task title")).toBeInTheDocument();
    expect(screen.getByLabelText("Task description")).toBeInTheDocument();
  });
});
