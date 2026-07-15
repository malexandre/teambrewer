import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  Combobox,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxItem,
  ComboboxItemCheck,
  ComboboxList,
  ComboboxPopover,
  ComboboxProvider,
} from "./combobox";

const FRUITS = ["Apple", "Apricot", "Banana"];

function matching(query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return FRUITS;
  return FRUITS.filter((fruit) => fruit.toLowerCase().includes(trimmed));
}

/** Mirrors the CardPicker usage: controlled query, clears the input on pick. */
function SingleSelectHarness({ onPick }: { onPick: (fruit: string) => void }) {
  const [query, setQuery] = useState("");
  return (
    <ComboboxProvider value={query} setValue={setQuery}>
      <Combobox aria-label="Search fruit" />
      <ComboboxPopover>
        <ComboboxList>
          {matching(query).map((fruit) => (
            <ComboboxItem
              key={fruit}
              value={fruit}
              setValueOnClick={false}
              onClick={() => {
                onPick(fruit);
                setQuery("");
              }}
            >
              {fruit}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxPopover>
    </ComboboxProvider>
  );
}

/** Mirrors the MultiSelect usage: array selection with a check indicator. */
function MultiSelectHarness() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <ComboboxProvider
      value={query}
      setValue={setQuery}
      selectedValue={selected}
      setSelectedValue={setSelected}
    >
      <Combobox aria-label="Search fruit" />
      <ComboboxPopover>
        <ComboboxList>
          <ComboboxGroup>
            <ComboboxGroupLabel>Fruit</ComboboxGroupLabel>
            {matching(query).map((fruit) => (
              <ComboboxItem key={fruit} value={fruit}>
                <ComboboxItemCheck />
                {fruit}
              </ComboboxItem>
            ))}
          </ComboboxGroup>
        </ComboboxList>
      </ComboboxPopover>
    </ComboboxProvider>
  );
}

describe("combobox primitives", () => {
  it("filters options by the controlled query value", async () => {
    const user = userEvent.setup();
    render(<SingleSelectHarness onPick={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Search fruit" }));
    expect(screen.getAllByRole("option")).toHaveLength(3);

    await user.type(screen.getByRole("combobox", { name: "Search fruit" }), "Ap");
    expect(screen.getByRole("option", { name: "Apple" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Apricot" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Banana" })).not.toBeInTheDocument();
  });

  it("clears the input on select (single-select action)", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<SingleSelectHarness onPick={onPick} />);

    const input = screen.getByRole("combobox", { name: "Search fruit" });
    await user.type(input, "Ban");
    await user.click(screen.getByRole("option", { name: "Banana" }));

    expect(onPick).toHaveBeenCalledWith("Banana");
    expect(input).toHaveValue("");
  });

  it("selects with the keyboard (ArrowDown then Enter)", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<SingleSelectHarness onPick={onPick} />);

    const input = screen.getByRole("combobox", { name: "Search fruit" });
    await user.type(input, "Ban");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onPick).toHaveBeenCalledWith("Banana");
  });

  it("toggles multiple selections and keeps the list open", async () => {
    const user = userEvent.setup();
    render(<MultiSelectHarness />);

    await user.click(screen.getByRole("combobox", { name: "Search fruit" }));
    await user.click(screen.getByRole("option", { name: "Apple" }));
    expect(screen.getByRole("option", { name: "Apple" })).toHaveAttribute("aria-selected", "true");

    // Still open — a second option is reachable and toggleable.
    await user.click(screen.getByRole("option", { name: "Banana" }));
    expect(screen.getByRole("option", { name: "Banana" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("option", { name: "Apple" }));
    expect(screen.getByRole("option", { name: "Apple" })).toHaveAttribute("aria-selected", "false");
  });
});
