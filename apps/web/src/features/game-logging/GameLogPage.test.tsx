import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}));
vi.mock("@/features/teams/active-team", () => ({
  useActiveTeam: () => ({ activeTeam: { teamId: "team-1" } }),
}));
vi.mock("./GameLogWizard", () => ({
  GameLogWizard: ({
    onSaved,
    onCancel,
  }: {
    onSaved: (game: { id: string }) => void;
    onCancel: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onSaved({ id: "game-9" })}>
        save
      </button>
      <button type="button" onClick={onCancel}>
        cancel
      </button>
    </div>
  ),
}));

import { NewGameLogPage } from "./GameLogPage";

describe("NewGameLogPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the full-screen create shell", () => {
    render(<NewGameLogPage />);
    expect(screen.getByText("Log a game")).toBeInTheDocument();
    expect(screen.getByText(/back to games/i)).toBeInTheDocument();
  });

  it("sends the saved log to its detail page", async () => {
    const user = userEvent.setup();
    render(<NewGameLogPage />);
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(navigate).toHaveBeenCalledWith({
      to: "/games/$gameLogId",
      params: { gameLogId: "game-9" },
    });
  });

  it("returns to the games list on cancel", async () => {
    const user = userEvent.setup();
    render(<NewGameLogPage />);
    await user.click(screen.getByRole("button", { name: "cancel" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/games" });
  });
});
