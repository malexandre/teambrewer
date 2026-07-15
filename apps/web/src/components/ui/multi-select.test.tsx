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

    const trigger = screen.getByRole("combobox", { name: "Covers" });
    expect(trigger).toHaveTextContent("Select…");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("option", { name: "Alpha" })).toBeInTheDocument();
  });

  it("toggles selection and summarizes it in the closed box", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox", { name: "Covers" }));
    await user.click(screen.getByRole("option", { name: "Alpha" }));
    // The list stays open across selections (multi-select).
    await user.click(screen.getByRole("option", { name: "Charlie" }));

    expect(screen.getByRole("combobox", { name: "Covers" })).toHaveTextContent("Alpha, Charlie");

    // A third selection collapses to a count.
    await user.click(screen.getByRole("option", { name: "Bravo" }));
    expect(screen.getByRole("combobox", { name: "Covers" })).toHaveTextContent("3 selected");

    // Toggling one off removes it.
    await user.click(screen.getByRole("option", { name: "Alpha" }));
    expect(screen.getByRole("option", { name: "Alpha" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("combobox", { name: "Covers" })).toHaveTextContent("Bravo, Charlie");
  });

  it("filters options with the typeahead search", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox", { name: "Covers" }));
    await user.type(screen.getByRole("combobox", { name: /search/i }), "ch");

    expect(screen.getByRole("option", { name: "Charlie" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Alpha" })).not.toBeInTheDocument();
  });

  it("selects with the keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox", { name: "Covers" }));
    const search = screen.getByRole("combobox", { name: /search/i });
    await user.type(search, "brav");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByRole("combobox", { name: "Covers" })).toHaveTextContent("Bravo");
  });
});
