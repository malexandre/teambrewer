import * as Ariakit from "@ariakit/react";
import { Check, ChevronsUpDown } from "lucide-react";
import { type ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Token-styled wrappers over Ariakit's combobox/select parts. Every rich select in the
 * app composes from these so popover, keyboard nav, and ARIA behave identically and the
 * shadcn-style design tokens live in one place. Ariakit does no built-in filtering — the
 * consumer decides which items to render from the provider's `value` (the search text).
 */

// Providers and stores are re-exported unstyled so consumers wire their own state.
export const ComboboxProvider = Ariakit.ComboboxProvider;
export const SelectProvider = Ariakit.SelectProvider;
export const useComboboxStore = Ariakit.useComboboxStore;
export const useSelectStore = Ariakit.useSelectStore;
export const useComboboxContext = Ariakit.useComboboxContext;
export const useSelectContext = Ariakit.useSelectContext;

const INPUT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const TRIGGER_CLASS =
  "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

const POPOVER_CLASS =
  "z-30 flex max-h-72 min-w-[8rem] flex-col overflow-auto overflow-x-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg";

const ITEM_CLASS =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[active-item]:bg-accent data-[active-item]:text-accent-foreground";

/** The search input (role=combobox). */
export function Combobox({ className, ...props }: ComponentProps<typeof Ariakit.Combobox>) {
  return <Ariakit.Combobox className={cn(INPUT_CLASS, className)} {...props} />;
}

/** A button that summarizes the current selection and opens a filterable popover. */
export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof Ariakit.Select>) {
  return (
    <Ariakit.Select className={cn(TRIGGER_CLASS, className)} {...props}>
      <span className="min-w-0 flex-1 truncate text-left">{children}</span>
      <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Ariakit.Select>
  );
}

export function ComboboxPopover({
  className,
  gutter = 4,
  sameWidth = true,
  ...props
}: ComponentProps<typeof Ariakit.ComboboxPopover>) {
  return (
    <Ariakit.ComboboxPopover
      gutter={gutter}
      sameWidth={sameWidth}
      className={cn(POPOVER_CLASS, className)}
      {...props}
    />
  );
}

export function SelectPopover({
  className,
  gutter = 4,
  sameWidth = true,
  ...props
}: ComponentProps<typeof Ariakit.SelectPopover>) {
  return (
    <Ariakit.SelectPopover
      gutter={gutter}
      sameWidth={sameWidth}
      className={cn(POPOVER_CLASS, className)}
      {...props}
    />
  );
}

export function ComboboxList({ className, ...props }: ComponentProps<typeof Ariakit.ComboboxList>) {
  return <Ariakit.ComboboxList className={cn("flex flex-col", className)} {...props} />;
}

export function ComboboxItem({ className, ...props }: ComponentProps<typeof Ariakit.ComboboxItem>) {
  return <Ariakit.ComboboxItem className={cn(ITEM_CLASS, className)} {...props} />;
}

/** A select item that also lives in a combobox list (shared-store composition). */
export function SelectItem({ className, ...props }: ComponentProps<typeof Ariakit.SelectItem>) {
  return <Ariakit.SelectItem className={cn(ITEM_CLASS, className)} {...props} />;
}

/** The checkmark shown on a selected multi-select row (renders only when selected). */
export function ComboboxItemCheck({
  className,
  ...props
}: ComponentProps<typeof Ariakit.ComboboxItemCheck>) {
  return (
    <Ariakit.ComboboxItemCheck
      className={cn("flex size-4 shrink-0 items-center justify-center text-primary", className)}
      {...props}
    >
      <Check className="size-4" aria-hidden="true" />
    </Ariakit.ComboboxItemCheck>
  );
}

export function ComboboxGroup({
  className,
  ...props
}: ComponentProps<typeof Ariakit.ComboboxGroup>) {
  return <Ariakit.ComboboxGroup className={cn("flex flex-col", className)} {...props} />;
}

export function ComboboxGroupLabel({
  className,
  ...props
}: ComponentProps<typeof Ariakit.ComboboxGroupLabel>) {
  return (
    <Ariakit.ComboboxGroupLabel
      className={cn("px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

/** Presentational "no results" / "no options" row. */
export function ComboboxEmpty({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-2 py-1.5 text-sm text-muted-foreground", className)} {...props} />;
}
