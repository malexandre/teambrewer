import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Optional per-option side colouring: blue for Deck A, red for Deck B. */
export type SegmentedTone = "sideA" | "sideB";

/**
 * Classes for a side-toned option. Each option keeps its side colour whether or
 * not it is selected (so the blue/red cue survives a mirror where both labels
 * read the same); the selected one is filled, the rest are outlined.
 */
function sideToneClassName(tone: SegmentedTone, isActive: boolean): string {
  if (tone === "sideA") {
    return isActive
      ? "border-info-border bg-info text-info-foreground hover:bg-info"
      : "border-info-border text-info-foreground hover:bg-info/50";
  }
  return isActive
    ? "border-danger-border bg-danger text-danger-foreground hover:bg-danger"
    : "border-danger-border text-danger-foreground hover:bg-danger/50";
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
