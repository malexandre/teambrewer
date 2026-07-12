import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { PrimerDetail } from "./PrimerDetail";

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

const MALICIOUS_BODY = '<script>alert("xss")</script> **not bold** just text';

const primer = {
  id: "p1",
  authorId: "user-1",
  author: { userId: "user-1", username: "alice", displayName: "Alice" },
  title: "Injection test primer",
  kind: "matchup" as const,
  relatedDeckId: null,
  relatedDeckName: null,
  visibility: "team" as const,
  body: MALICIOUS_BODY,
  archivedAt: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};

function mockApi(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.endsWith("/api/me")) return json(CURRENT_USER);
    if (url.includes("/api/primers/p1")) return json(primer);
    if (url.includes("/api/comments")) return json({ data: [] });
    if (url.includes("/api/members")) return json({ data: [] });
    throw new Error(`Unexpected request: ${url}`);
  });
}

function renderDetail(ui: ReactNode) {
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

describe("PrimerDetail", () => {
  it("renders a script-laden body as literal, escaped text (never executes it)", async () => {
    mockApi();
    const { container } = renderDetail(<PrimerDetail primerId="p1" />);

    // The body renders verbatim as text — React escapes it, so the string is visible…
    expect(await screen.findByText(/not bold/)).toBeInTheDocument();
    expect(container.textContent).toContain('<script>alert("xss")</script>');
    // …and no actual <script> element was injected into the DOM from the body.
    expect(container.querySelector("script")).toBeNull();
  });
});
