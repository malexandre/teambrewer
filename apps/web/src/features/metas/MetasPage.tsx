import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { useActiveTeam } from "@/features/teams/active-team";

import { formatMetaDate } from "./meta-display";
import { MetaForm } from "./MetaForm";
import { MetaList } from "./MetaList";
import { useCurrentMeta } from "./use-metas";

/** The team's metas: the current meta callout, the full list, and create a new meta. */
export function MetasPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const navigate = useNavigate();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: currentMeta } = useCurrentMeta(teamId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Metas</CardTitle>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            New meta
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {currentMeta ? (
          <Link
            to="/metas/$metaId"
            params={{ metaId: currentMeta.id }}
            className="flex flex-col gap-1 rounded-md border border-primary/40 bg-primary/5 p-3 hover:bg-primary/10"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">
              Current meta
            </span>
            <span className="font-medium">{currentMeta.name}</span>
            <span className="text-xs text-muted-foreground">
              {formatMetaDate(currentMeta.startDate)} → {formatMetaDate(currentMeta.endDate)}
            </span>
          </Link>
        ) : (
          <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
            No current meta — none of your metas' windows contain today.
          </p>
        )}

        <MetaList teamId={teamId} />
      </CardContent>

      <Dialog open={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="New meta">
        <MetaForm
          teamId={teamId}
          onSaved={(meta) => {
            setIsCreateOpen(false);
            void navigate({ to: "/metas/$metaId", params: { metaId: meta.id } });
          }}
          onCancel={() => setIsCreateOpen(false)}
        />
      </Dialog>
    </Card>
  );
}
