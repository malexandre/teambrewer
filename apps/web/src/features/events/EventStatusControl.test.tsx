import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EventStatusControl } from "./EventStatusControl";

describe("EventStatusControl", () => {
  it("offers only the transitions allowed from an upcoming event", () => {
    render(<EventStatusControl status="upcoming" onChange={vi.fn()} />);
    const options = screen
      .getAllByRole("option")
      .map((option) => option.textContent)
      .filter((label) => label !== "Change status…");
    expect(new Set(options)).toEqual(new Set(["Active", "Archived"]));
    expect(options).not.toContain("Upcoming");
    expect(options).not.toContain("Completed");
  });

  it("offers no transitions from an archived (terminal) event", () => {
    render(<EventStatusControl status="archived" onChange={vi.fn()} />);
    const control = screen.getByRole("combobox", { name: /change status/i });
    expect(control).toBeDisabled();
  });

  it("calls onChange with the chosen next status", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<EventStatusControl status="active" onChange={onChange} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /change status/i }), "completed");
    expect(onChange).toHaveBeenCalledWith("completed");
  });
});
