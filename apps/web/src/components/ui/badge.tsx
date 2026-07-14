import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A small status pill. `tone` is a semantic status color (independent of the
 * brand accent) — the single place badge coloring is defined, so every status
 * across the app (task lifecycle, meta tiers, game results, data confidence…)
 * reads from one system. Pastel by design: legible without being jarring.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground border-border",
        success: "bg-success text-success-foreground border-success-border",
        warning: "bg-warning text-warning-foreground border-warning-border",
        danger: "bg-danger text-danger-foreground border-danger-border",
        info: "bg-info text-info-foreground border-info-border",
        primary: "bg-accent text-accent-foreground border-primary/25",
      },
      size: {
        default: "px-2 py-0.5 text-xs",
        sm: "px-1.5 py-px text-[0.7rem]",
      },
    },
    defaultVariants: { tone: "neutral", size: "default" },
  },
);

/** The semantic tones a badge can take. */
export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

type BadgeProps = ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** Show a leading status dot in the current tone's foreground color. */
    dot?: boolean;
  };

export function Badge({ className, tone, size, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size, className }))} {...props}>
      {dot ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export { badgeVariants };
