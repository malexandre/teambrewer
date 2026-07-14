import { ChevronsUpDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  /** Plain-text label used for the closed-box summary. */
  label: string;
  /** Optional rich content for the open list row (falls back to `label`). */
  node?: ReactNode;
}

/**
 * A closed "box" that opens a checkbox popover for choosing several options. The app's
 * multi-selection idiom was inline checkbox lists; this packages the same mechanic into
 * a compact control that stays small when the option set is large. Controlled: pass the
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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape (menu-dismissal accessibility).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectedLabels = options
    .filter((option) => value.includes(option.value))
    .map((o) => o.label);
  const summary =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels.length} selected`;

  function toggle(optionValue: string) {
    onChange(
      value.includes(optionValue)
        ? value.filter((v) => v !== optionValue)
        : [...value, optionValue],
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        <span className={cn("truncate", selectedLabels.length === 0 && "text-muted-foreground")}>
          {summary}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 max-h-64 w-full min-w-56 overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-primary"
                  checked={value.includes(option.value)}
                  onChange={() => toggle(option.value)}
                />
                <span className="min-w-0">{option.node ?? option.label}</span>
              </label>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
