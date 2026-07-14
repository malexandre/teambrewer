import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { useActiveTeam } from "@/features/teams/active-team";

import { MetaForm } from "./MetaForm";
import { MetaList } from "./MetaList";

/** The team's metas: a single newest-first list (per format) and create a new meta. */
export function MetasPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const navigate = useNavigate();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

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
