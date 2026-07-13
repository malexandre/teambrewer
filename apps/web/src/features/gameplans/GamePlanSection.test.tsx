import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { GamePlanSection } from "./GamePlanSection";

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

const plan = {
  id: "gp1",
  ourDeckId: "deck-1",
  ourDeckName: "Aggro Dori",
  formatId: "format-1",
  opponentGauntletEntryId: null,
  opponentHeroId: "hero-1",
  opponentArchetypeLabel: null,
  opponentRef: "hero:hero-1",
  opponentSnapshotLabel: "Briar",
  body: "Race the clock; keep +[[card-1]] for the on-hit.",
  updatedBy: { userId: "user-1", username: "alice", displayName: "Alice" },
  archivedAt: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};

function mockApi(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.endsWith("/api/me")) return json(CURRENT_USER);
    if (url.includes("/api/heroes")) {
      return json({ data: [{ id: "hero-1", name: "Briar", classes: [], talents: [] }] });
    }
    if (url.includes("/api/cards/card-1")) {
      return json({ id: "card-1", name: "Command and Conquer", pitch: 1, imageUrl: null });
    }
    if (url.includes("/api/game-plans")) {
      return json({ data: [plan], nextCursor: null });
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

describe("GamePlanSection", () => {
  it("renders the deck's plans with the matchup header, body, and inline card chips", async () => {
    mockApi();
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived={false} />,
    );

    expect(await screen.findByText("vs Briar")).toBeInTheDocument();
    expect(screen.getByText(/Race the clock/)).toBeInTheDocument();
    // The +[[card-1]] token resolves to an inline "+Command and Conquer" chip.
    expect(await screen.findByText(/Command and Conquer/)).toBeInTheDocument();
  });

  it("reveals the editor with the plan body composer and an opponent toggle when writing", async () => {
    mockApi();
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived={false} />,
    );

    await screen.findByText("vs Briar");
    await userEvent.click(screen.getByRole("button", { name: "Write a game-plan" }));

    // The body is a +card-enabled composer (type + to link a card inline).
    expect(screen.getByLabelText("Plan")).toBeInTheDocument();
    // Switching the opponent to an archetype label reveals the free-text field.
    await userEvent.click(screen.getByRole("button", { name: "Archetype label" }));
    expect(screen.getByLabelText("Archetype label")).toBeInTheDocument();
  });

  it("hides the write action when the deck is archived", async () => {
    mockApi();
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived />,
    );

    await screen.findByText("vs Briar");
    expect(screen.queryByRole("button", { name: "Write a game-plan" })).not.toBeInTheDocument();
  });
});
