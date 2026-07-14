import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Visual tone of a section container. `accent` highlights a primary callout. */
type SectionTone = "default" | "accent";

const SECTION_TONE_CLASSES: Record<SectionTone, string> = {
  default: "border-border bg-card text-card-foreground",
  accent: "border-primary/40 bg-primary/5 text-card-foreground",
};

/**
 * A bordered, elevated content block — the app's single reusable unit of visual
 * sectioning. It lifts off the (tinted) page canvas with a border + subtle shadow
 * in both themes, giving distinct sections real separation instead of one
 * undifferentiated column. Compose it with an optional titled header (title +
 * description + right-aligned actions, divided from the body) and a consistently
 * padded body. Use the `accent` tone for a primary callout.
 */
export function Section({
  title,
  description,
  actions,
  tone = "default",
  bodyClassName,
  className,
  children,
  ...rest
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: SectionTone;
  bodyClassName?: string;
  children: ReactNode;
} & Omit<ComponentProps<"section">, "title" | "children">) {
  const hasHeader = Boolean(title) || Boolean(actions) || Boolean(description);
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border shadow-sm",
        SECTION_TONE_CLASSES[tone],
        className,
      )}
      {...rest}
    >
      {hasHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title ? <h3 className="text-sm font-semibold tracking-tight">{title}</h3> : null}
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("flex flex-col gap-4 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
