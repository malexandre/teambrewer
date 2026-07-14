import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { MultiSelect, type MultiSelectOption } from "./multi-select";

const OPTIONS: MultiSelectOption[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
  { value: "c", label: "Charlie" },
];

/** Controlled harness mirroring how the game-plan editor drives the control. */
function Harness({ initial = [] as string[] }) {
  const [value, setValue] = useState(initial);
  return <MultiSelect options={OPTIONS} value={value} onChange={setValue} ariaLabel="Covers" />;
}

describe("MultiSelect", () => {
  it("shows the placeholder when nothing is selected and opens on click", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Covers" });
    expect(trigger).toHaveTextContent("Select…");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("checkbox", { name: "Alpha" })).toBeInTheDocument();
  });

  it("toggles selection and summarizes it in the closed box", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Covers" }));
    await user.click(screen.getByRole("checkbox", { name: "Alpha" }));
    await user.click(screen.getByRole("checkbox", { name: "Charlie" }));

    // Two selected → both labels shown.
    expect(screen.getByRole("button", { name: "Covers" })).toHaveTextContent("Alpha, Charlie");

    // A third selection collapses to a count.
    await user.click(screen.getByRole("checkbox", { name: "Bravo" }));
    expect(screen.getByRole("button", { name: "Covers" })).toHaveTextContent("3 selected");

    // Unchecking removes it.
    await user.click(screen.getByRole("checkbox", { name: "Alpha" }));
    expect(screen.getByRole("checkbox", { name: "Alpha" })).not.toBeChecked();
  });
});
