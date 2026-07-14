import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Tabs } from "./tabs";

/** A small controlled harness mirroring how the deck detail drives the tabs. */
function Harness() {
  const [activeTabId, setActiveTabId] = useState("general");
  return (
    <Tabs
      ariaLabel="Deck sections"
      activeTabId={activeTabId}
      onTabChange={setActiveTabId}
      tabs={[
        { id: "general", label: "General", panel: <p>general content</p> },
        { id: "matchups", label: "Matchup Matrix", panel: <p>matchup content</p> },
        { id: "plan", label: "Plan", panel: <p>plan content</p> },
      ]}
    />
  );
}

describe("Tabs", () => {
  it("shows only the active tab's panel and switches on click", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // The first tab is selected and its panel is visible.
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("general content")).toBeInTheDocument();
    expect(screen.queryByText("plan content")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Plan" }));

    expect(screen.getByRole("tab", { name: "Plan" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("plan content")).toBeInTheDocument();
    expect(screen.queryByText("general content")).not.toBeInTheDocument();
  });

  it("moves selection with the arrow keys (roving tabindex)", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const generalTab = screen.getByRole("tab", { name: "General" });
    generalTab.focus();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "Matchup Matrix" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("matchup content")).toBeInTheDocument();
  });

  it("wraps from the last tab back to the first with ArrowRight", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("tab", { name: "Plan" }));
    screen.getByRole("tab", { name: "Plan" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
  });
});
