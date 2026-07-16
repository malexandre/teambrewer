import { BedDouble, Plane } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * The at-a-glance strip above the roster: how many going members still need transport
 * and/or lodging. Renders nothing when everyone travelling is sorted, so it only shows
 * up when there's something the team needs to help with.
 */
export function TravelNeedsSummary({
  transportCount,
  lodgingCount,
}: {
  transportCount: number;
  lodgingCount: number;
}) {
  if (transportCount === 0 && lodgingCount === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Still needs help</span>
      {transportCount > 0 ? (
        <Badge tone="warning">
          <Plane aria-hidden="true" className="size-3" />
          {transportCount} {transportCount === 1 ? "needs" : "need"} transport
        </Badge>
      ) : null}
      {lodgingCount > 0 ? (
        <Badge tone="warning">
          <BedDouble aria-hidden="true" className="size-3" />
          {lodgingCount} {lodgingCount === 1 ? "needs" : "need"} lodging
        </Badge>
      ) : null}
    </div>
  );
}
