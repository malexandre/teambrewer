import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useActiveTeam } from "@/features/teams/active-team";

import { DecisionsTab } from "./DecisionsTab";
import { PollsTab } from "./PollsTab";
import { PrimersTab } from "./PrimersTab";

type KnowledgeTab = "primers" | "decisions" | "polls";

const TABS: { value: KnowledgeTab; label: string }[] = [
  { value: "primers", label: "Primers" },
  { value: "decisions", label: "Decisions" },
  { value: "polls", label: "Polls" },
];

/**
 * The team-knowledge hub (phase-10): the durable memory that outlives chat — long-form
 * primers, the decisions log, and polls. A simple tab switch keeps each surface focused;
 * all three are strictly scoped to the active team.
 */
export function KnowledgePage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const [tab, setTab] = useState<KnowledgeTab>("primers");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Team knowledge</h1>
        <p className="text-sm text-muted-foreground">
          Primers, decisions, and polls — the conclusions that outlast the chat.
        </p>
      </div>

      <div role="tablist" aria-label="Knowledge sections" className="flex items-center gap-1">
        {TABS.map((entry) => (
          <Button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={tab === entry.value}
            size="sm"
            variant={tab === entry.value ? "default" : "outline"}
            onClick={() => setTab(entry.value)}
          >
            {entry.label}
          </Button>
        ))}
      </div>

      {tab === "primers" ? <PrimersTab teamId={teamId} /> : null}
      {tab === "decisions" ? <DecisionsTab teamId={teamId} /> : null}
      {tab === "polls" ? <PollsTab teamId={teamId} /> : null}
    </div>
  );
}
