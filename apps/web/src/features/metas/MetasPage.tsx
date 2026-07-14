import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Metas"
        actions={
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            New meta
          </Button>
        }
      />

      {currentMeta ? (
        <Link
          to="/metas/$metaId"
          params={{ metaId: currentMeta.id }}
          className="flex flex-col gap-1 rounded-lg border border-primary/40 bg-primary/5 p-4 shadow-sm transition-colors hover:bg-primary/10"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">
            Current meta
          </span>
          <span className="text-base font-medium">{currentMeta.name}</span>
          <span className="text-xs text-muted-foreground">
            {formatMetaDate(currentMeta.startDate)} → {formatMetaDate(currentMeta.endDate)}
          </span>
        </Link>
      ) : (
        <EmptyState message="No current meta — none of your metas' windows contain today." />
      )}

      <Section aria-label="Metas">
        <MetaList teamId={teamId} />
      </Section>

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
    </div>
  );
}
