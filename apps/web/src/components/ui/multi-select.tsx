import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import {
  Combobox,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  SelectItem,
  SelectItemCheck,
  SelectPopover,
  SelectTrigger,
  useComboboxStore,
  useSelectStore,
} from "./combobox";

export interface MultiSelectOption {
  value: string;
  /** Plain-text label used for the closed-box summary and typeahead filter. */
  label: string;
  /** Optional rich content for the open list row (falls back to `label`). */
  node?: ReactNode;
}

/**
 * A closed "box" that opens a searchable checkbox popover for choosing several options.
 * Built on Ariakit's Select + Combobox composition: the select store holds the array of
 * selected values, the combobox store drives the typeahead. Controlled — pass the
 * selected `value` array and an `onChange` that receives the full next selection.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  ariaLabel,
  id,
  disabled = false,
  emptyMessage = "No options.",
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  const [searchValue, setSearchValue] = useState("");
  const combobox = useComboboxStore({
    value: searchValue,
    setValue: setSearchValue,
    resetValueOnHide: true,
  });
  const select = useSelectStore({ combobox, value, setValue: onChange });

  const selectedLabels = options
    .filter((option) => value.includes(option.value))
    .map((option) => option.label);
  const summary =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels.length} selected`;

  const query = searchValue.trim().toLowerCase();
  const shownOptions =
    query.length === 0
      ? options
      : options.filter((option) => option.label.toLowerCase().includes(query));

  return (
    <>
      <SelectTrigger
        store={select}
        id={id}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(selectedLabels.length === 0 && "text-muted-foreground")}
      >
        {summary}
      </SelectTrigger>
      <SelectPopover store={select} className="gap-1">
        <Combobox store={combobox} aria-label="Search options" placeholder="Search…" />
        <ComboboxList store={combobox}>
          {shownOptions.length === 0 ? (
            <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
          ) : (
            shownOptions.map((option) => (
              <SelectItem
                key={option.value}
                store={select}
                value={option.value}
                render={<ComboboxItem />}
              >
                <SelectItemCheck />
                <span className="min-w-0">{option.node ?? option.label}</span>
              </SelectItem>
            ))
          )}
        </ComboboxList>
      </SelectPopover>
    </>
  );
}
