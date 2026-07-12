import { useState } from "react";

import { Button } from "@/components/ui/button";

import { DecisionCard } from "./DecisionCard";
import { DecisionEditor } from "./DecisionEditor";
import { useDecisions } from "./use-decisions";

/** The decisions log: reverse-chronological cards + an inline "record a decision" form. */
export function DecisionsTab({ teamId }: { teamId: string | undefined }) {
  const [recording, setRecording] = useState(false);
  const { data, isPending } = useDecisions(teamId);
  const decisions = data?.data ?? [];

  return (
    <section className="flex flex-col gap-3" aria-label="Decisions log">
      <div className="flex items-center justify-end">
        {!recording ? (
          <Button type="button" size="sm" onClick={() => setRecording(true)}>
            Record a decision
          </Button>
        ) : null}
      </div>

      {recording ? <DecisionEditor teamId={teamId} onDone={() => setRecording(false)} /> : null}

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading decisions…</p>
      ) : decisions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {decisions.map((decision) => (
            <li key={decision.id}>
              <DecisionCard teamId={teamId} decision={decision} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
