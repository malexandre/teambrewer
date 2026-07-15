import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Optional per-option colouring: blue for Deck A, red for Deck B, grey for a draw. */
export type SegmentedTone = "sideA" | "sideB" | "neutral";

/**
 * Classes for a toned option. Every option is always tinted with its colour (blue /
 * red / grey) so the side cue survives a mirror where both labels read the same.
 * Selection is a separate signal: the chosen option gets a strong primary-blue ring —
 * the same ring regardless of the button's own colour, so "which is picked" never
 * reads as "which colour".
 */
export function sideToneClassName(tone: SegmentedTone, isActive: boolean): string {
  const ring = isActive ? "ring-2 ring-primary" : "";
  if (tone === "sideA") {
    return cn("border-info-border bg-info text-info-foreground hover:bg-info", ring);
  }
  if (tone === "sideB") {
    return cn("border-danger-border bg-danger text-danger-foreground hover:bg-danger", ring);
  }
  return cn("bg-secondary text-secondary-foreground hover:bg-secondary", ring);
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
              {option.label}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}
