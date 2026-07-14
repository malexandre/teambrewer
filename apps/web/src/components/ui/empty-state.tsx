import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A consistent placeholder for an empty list or a not-yet-populated section: a
 * dashed, muted panel that reads as intentionally empty rather than as content
 * that failed to load. Keep the message short; pass an optional action (e.g. a
 * "New …" button) to guide the next step.
 */
export function EmptyState({
  message,
  action,
  className,
}: {
  message: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-8 text-center",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">{message}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
