import type { Attendance } from "@teambrewer/shared";

import { Avatar } from "@/components/ui/avatar";

/**
 * A member who is only interested (not committed to travelling), shown as a light avatar
 * pill — no ticket, since there's no trip to plan yet.
 */
export function InterestedChip({ attendance }: { attendance: Attendance }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 py-1 pl-1 pr-3 text-sm">
      <Avatar name={attendance.user.displayName} size="sm" />
      <span className="truncate">{attendance.user.displayName}</span>
    </span>
  );
}
