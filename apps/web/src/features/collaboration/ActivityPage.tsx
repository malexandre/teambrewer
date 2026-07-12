import type { SubjectType } from "@teambrewer/shared";
import { useState } from "react";

import { useActiveTeam } from "@/features/teams/active-team";

import { ActivityFeed, ACTIVITY_SUBJECT_FILTERS } from "./ActivityFeed";

/** The team activity timeline route, with a subject-type filter. */
export function ActivityPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const [subjectType, setSubjectType] = useState<SubjectType | "all">("all");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Team activity</h2>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filter</span>
          <select
            className="rounded-md border border-input bg-background px-2 py-1"
            aria-label="Filter activity by subject"
            value={subjectType}
            onChange={(event) => setSubjectType(event.target.value as SubjectType | "all")}
          >
            {ACTIVITY_SUBJECT_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ActivityFeed
        teamId={teamId}
        filters={subjectType === "all" ? {} : { subjectType }}
        title="Recent activity"
      />
    </div>
  );
}
