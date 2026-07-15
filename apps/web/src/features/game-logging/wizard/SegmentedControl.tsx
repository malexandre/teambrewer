import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Optional per-option colouring: blue for Deck A, red for Deck B, grey for a draw. */
export type SegmentedTone = "sideA" | "sideB" | "neutral";

/**
 * Classes for a toned option. Every option keeps its colour whether or not it is
 * selected (so the blue/red cue survives a mirror where both labels read the same).
 * Selection is a signal separate from the colour: the chosen option gets a filled
 * tint plus a ring (and a check, added below), while the rest are a plain outline —
 * so it never reads as "which colour" vs "which is picked". The neutral tone is the
 * draw: grey, so it stands apart from either side even when it is the selected one.
 */
function sideToneClassName(tone: SegmentedTone, isActive: boolean): string {
  if (tone === "sideA") {
    return isActive
      ? "border-info-border bg-info text-info-foreground ring-2 ring-info-border hover:bg-info"
      : "border-info-border text-info-foreground hover:bg-info/50";
  }
  if (tone === "sideB") {
    return isActive
      ? "border-danger-border bg-danger text-danger-foreground ring-2 ring-danger-border hover:bg-danger"
      : "border-danger-border text-danger-foreground hover:bg-danger/50";
  }
  return isActive
    ? "bg-secondary text-secondary-foreground ring-2 ring-border hover:bg-secondary"
    : "text-muted-foreground hover:bg-muted/50";
}

/** A row of mutually-exclusive buttons (the segmented-control idiom used across the app). */
export function SegmentedControl<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: { value: Value; label: string; tone?: SegmentedTone }[];
  onChange: (next: Value) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-medium">{label}</legend>
      {/* Equal-width columns that fill the row so a group never wraps onto a second line
          on phones; long labels wrap inside their own cell instead. */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const isActive = value === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={option.tone ? "outline" : isActive ? "default" : "outline"}
              aria-pressed={isActive}
              className={cn(
                "h-auto min-h-8 w-full py-1 text-center whitespace-normal",
                option.tone && sideToneClassName(option.tone, isActive),
              )}
              onClick={() => onChange(option.value)}
            >
              {option.tone && isActive ? (
                <Check className="size-3.5 shrink-0" aria-hidden="true" />
              ) : null}
              {option.label}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}
