import { useState } from "react";

import { Button } from "@/components/ui/button";

import { PollCard } from "./PollCard";
import { PollEditor } from "./PollEditor";
import { usePolls, type PollFilters } from "./use-polls";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

/** The polls board: a status filter, an inline create form, and the team's poll cards. */
export function PollsTab({ teamId }: { teamId: string | undefined }) {
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const filters: PollFilters = status === "open" || status === "closed" ? { status } : {};
  const { data, isPending } = usePolls(teamId, filters);
  const polls = data?.data ?? [];

  return (
    <section className="flex flex-col gap-3" aria-label="Polls">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          className="rounded-md border border-input bg-background p-2 text-sm"
          aria-label="Filter by status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {!creating ? (
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            Create a poll
          </Button>
        ) : null}
      </div>

      {creating ? <PollEditor teamId={teamId} onDone={() => setCreating(false)} /> : null}

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading polls…</p>
      ) : polls.length === 0 ? (
        <p className="text-sm text-muted-foreground">No polls yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {polls.map((poll) => (
            <li key={poll.id}>
              <PollCard teamId={teamId} poll={poll} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
