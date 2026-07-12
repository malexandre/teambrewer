import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DeckStatusControl } from "./DeckStatusControl";

describe("DeckStatusControl", () => {
  it("offers only the transitions allowed from a retired deck (reopen to testing)", () => {
    render(<DeckStatusControl status="retired" onChange={vi.fn()} />);
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toContain("Testing");
    expect(options).not.toContain("Exploratory");
    expect(options).not.toContain("Tournament ready");
  });

  it("offers the active-state transitions but never a no-op to the current status", () => {
    render(<DeckStatusControl status="exploratory" onChange={vi.fn()} />);
    const options = screen
      .getAllByRole("option")
      .map((option) => option.textContent)
      .filter((label) => label !== "Change status…");
    expect(new Set(options)).toEqual(new Set(["Testing", "Tournament ready", "Retired"]));
    expect(options).not.toContain("Exploratory");
  });

  it("calls onChange with the chosen next status", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DeckStatusControl status="exploratory" onChange={onChange} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /change status/i }), "testing");
    expect(onChange).toHaveBeenCalledWith("testing");
  });
});
