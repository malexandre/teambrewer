import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { AdminAccountsPage, AdminMembersPage, AdminTeamsPage } from "./AdminPage";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const INSTANCE_ADMIN = {
  id: "admin-1",
  username: "admin",
  displayName: "Local Admin",
  isInstanceAdmin: true,
  authMethod: "password_totp",
  totpEnabled: true,
  discordUserId: null,
  discordUsername: null,
};

const PLAIN_MEMBER = { ...INSTANCE_ADMIN, id: "user-2", username: "bob", isInstanceAdmin: false };

const TEAMS = [
  {
    id: "team-rosette",
    name: "Rosette",
    slug: "rosette",
    gameId: "flesh-and-blood",
    createdBy: "admin-1",
    createdAt: "2026-07-13T00:00:00.000Z",
    archivedAt: null,
  },
  {
    id: "team-rb",
    name: "RB",
    slug: "rb",
    gameId: "riftbound",
    createdBy: "admin-1",
    createdAt: "2026-07-13T00:00:00.000Z",
    archivedAt: null,
  },
];

/** Records the member-add payloads so the add-existing form is observable. */
function mockApi(user: typeof INSTANCE_ADMIN): { addBodies: unknown[] } {
  const addBodies: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    // The instance-admin belongs to no team.
    if (url.endsWith("/api/me/teams")) return json({ data: [] });
    if (url.endsWith("/api/me")) return json(user);
    if (url.endsWith("/api/games")) {
      return json({
        data: [
          { id: "flesh-and-blood", key: "flesh_and_blood", name: "Flesh and Blood" },
          { id: "riftbound", key: "riftbound", name: "Riftbound" },
        ],
      });
    }
    if (url.endsWith("/api/admin/teams")) return json({ data: TEAMS });
    if (/\/api\/admin\/teams\/[^/]+\/members\/candidate-users$/.test(url)) {
      return json({ data: [{ id: "user-9", username: "carol", displayName: "Carol" }] });
    }
    if (
      /\/api\/admin\/teams\/[^/]+\/users\/[^/]+\/setup-link$/.test(url) &&
      init?.method === "POST"
    ) {
      return json({
        purpose: "setup",
        url: "http://localhost:5173/setup/tok_abc",
        expiresAt: "2026-07-17T00:00:00.000Z",
      });
    }
    if (/\/api\/admin\/teams\/[^/]+\/members$/.test(url) && init?.method === "POST") {
      addBodies.push(JSON.parse(String(init.body)));
      return json(
        {
          userId: "user-9",
          username: "carol",
          displayName: "Carol",
          role: "member",
          joinedAt: "2026-07-13T00:00:00.000Z",
        },
        201,
      );
    }
    if (/\/api\/admin\/teams\/[^/]+\/members$/.test(url)) {
      return json({
        data: [
          {
            userId: "user-3",
            username: "dave",
            displayName: "Dave",
            role: "team_admin",
            joinedAt: "2026-07-13T00:00:00.000Z",
          },
        ],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  return { addBodies };
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

describe("AdminPage", () => {
  it("lets an instance-admin with no membership pick a team and manage its members", async () => {
    mockApi(INSTANCE_ADMIN);
    renderPage(<AdminMembersPage />);

    // The team picker offers the teams the admin created.
    expect(await screen.findByRole("option", { name: "Rosette" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "RB" })).toBeInTheDocument();

    // The management panel renders (not the "you do not administer" fallback).
    expect(screen.queryByText(/do not administer/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/Dave/)).toBeInTheDocument();

    // The add-existing-member form is present and posts the selected username.
    await userEvent.selectOptions(await screen.findByLabelText("Existing account"), "carol");
    await userEvent.click(screen.getByRole("button", { name: "Add member" }));
  });

  it("posts the selected candidate's username to the add-member endpoint", async () => {
    const { addBodies } = mockApi(INSTANCE_ADMIN);
    renderPage(<AdminMembersPage />);

    await screen.findByRole("option", { name: "Rosette" });
    await userEvent.selectOptions(await screen.findByLabelText("Existing account"), "carol");
    await userEvent.click(screen.getByRole("button", { name: "Add member" }));

    await waitFor(() => expect(addBodies).toContainEqual({ username: "carol", role: "member" }));
  });

  it("offers the game catalog as a select in the team-create form", async () => {
    mockApi(INSTANCE_ADMIN);
    renderPage(<AdminTeamsPage />);

    const gameSelect = await screen.findByLabelText("Game");
    expect(gameSelect).toBeInstanceOf(HTMLSelectElement);
    expect(await screen.findByRole("option", { name: "Flesh and Blood" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Riftbound" })).toBeInTheDocument();
  });

  it("renders the create-account form under Accounts for an instance-admin", async () => {
    mockApi(INSTANCE_ADMIN);
    renderPage(<AdminAccountsPage />);

    await screen.findByRole("option", { name: "Rosette" });
    expect(await screen.findByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("surfaces a freshly generated invite link in a dialog", async () => {
    mockApi(INSTANCE_ADMIN);
    renderPage(<AdminMembersPage />);

    await screen.findByText(/Dave/);
    await userEvent.click(screen.getByRole("button", { name: "New invite link" }));

    const dialog = await screen.findByRole("dialog", { name: "Invite link" });
    expect(within(dialog).getByTestId("generated-link")).toHaveTextContent(
      "http://localhost:5173/setup/tok_abc",
    );
  });

  it("tells a non-admin they administer no team", async () => {
    mockApi(PLAIN_MEMBER);
    renderPage(<AdminMembersPage />);

    expect(await screen.findByText(/do not administer/i)).toBeInTheDocument();
  });
});
