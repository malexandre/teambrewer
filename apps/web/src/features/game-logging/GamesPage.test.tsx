import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@/features/teams/active-team", () => ({
  useActiveTeam: () => ({ activeTeam: { teamId: "team-1" } }),
}));
vi.mock("./GameList", () => ({ GameList: () => <div data-testid="game-list" /> }));

import { GamesPage } from "./GamesPage";

describe("GamesPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("logs a game via the isolated route rather than an inline form", async () => {
    const user = userEvent.setup();
    render(<GamesPage />);
    // The list is always shown; no inline wizard sits above it.
    expect(screen.getByTestId("game-list")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /log a game/i }));
    expect(navigate).toHaveBeenCalledWith({ to: "/games/new" });
  });
});
