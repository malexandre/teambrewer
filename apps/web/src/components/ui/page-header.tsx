import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The consistent header at the top of every page: an optional back slot (a link to
 * the parent list), the page title, an optional description, and right-aligned
 * primary actions. A bottom divider separates it cleanly from the page content
 * below so the eye reads title → actions → content in the same place everywhere.
 */
export function PageHeader({
  title,
  description,
  actions,
  backSlot,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  backSlot?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 border-b border-border pb-4", className)}>
      {backSlot ? <div className="text-sm">{backSlot}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
        </div>
        {actions ? (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
