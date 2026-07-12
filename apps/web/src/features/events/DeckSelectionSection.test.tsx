import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { DeckSelectionSection } from "./DeckSelectionSection";

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

const deckSummary = {
  id: "deck-1",
  name: "Aggro Dori",
  gameId: "flesh-and-blood",
  formatId: "format-1",
  heroId: null,
  externalUrl: "https://fabrary.net/decks/x",
  source: "fabrary",
  ownerId: "user-1",
  status: "testing",
  visibility: "team",
  isReference: false,
  tags: [],
  archivedAt: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};

const selection = (overrides: Record<string, unknown>) => ({
  id: "sel-1",
  eventId: "event-1",
  member: { userId: "user-1", username: "alice", displayName: "Alice" },
  deckId: "deck-1",
  deckName: "Aggro Dori",
  deckFormatId: "format-1",
  reasoning: "Best vs the field.",
  locked: false,
  lockedAt: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
  ...overrides,
});

function mockApi(options: { locked: boolean }): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.endsWith("/api/me")) return json(CURRENT_USER);
    if (url.includes("/deck-selections")) {
      return json({
        data: [
          selection({
            locked: options.locked,
            lockedAt: options.locked ? "2026-07-12T01:00:00.000Z" : null,
          }),
        ],
      });
    }
    if (url.includes("/api/decks")) return json({ data: [deckSummary], nextCursor: null });
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

describe("DeckSelectionSection", () => {
  it("shows a lock badge and disables editing when the caller's selection is locked", async () => {
    mockApi({ locked: true });
    renderSection(
      <DeckSelectionSection teamId="team-1" eventId="event-1" eventFormatId="format-1" />,
    );

    expect(await screen.findByLabelText("Locked")).toBeInTheDocument();
    // A locked selection offers no "Change" affordance to its owner.
    expect(screen.queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
  });

  it("offers a Change action when the caller's selection is unlocked", async () => {
    mockApi({ locked: false });
    renderSection(
      <DeckSelectionSection teamId="team-1" eventId="event-1" eventFormatId="format-1" />,
    );

    expect(await screen.findByRole("button", { name: "Change" })).toBeInTheDocument();
    // A plain member never sees the admin lock control.
    expect(screen.queryByRole("button", { name: "Lock" })).not.toBeInTheDocument();
  });
});
