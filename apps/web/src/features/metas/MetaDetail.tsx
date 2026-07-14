import { useNavigate } from "@tanstack/react-router";
import type { MetaDetail as MetaDetailType } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { ApiError } from "@/lib/api-client";

import { MetaDeckEntryBuilder } from "./MetaDeckEntryBuilder";
import { formatMetaDate } from "./meta-display";
import { MetaForm } from "./MetaForm";
import { useArchiveMeta } from "./use-meta-mutations";
import { useMetaDeckEntries } from "./use-metas";

/**
 * A meta's detail: the organizing hub. Header (name, window), description, and the
 * tiered opponent-deck list. Permissions are a shared team board — any member may
 * edit the meta, its deck list, and archive it. Editing opens the form in a modal.
 */
export function MetaDetail({
  teamId,
  meta,
  isCurrent,
}: {
  teamId: string | undefined;
  meta: MetaDetailType;
  isCurrent: boolean;
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const archiveMeta = useArchiveMeta(teamId, meta.id);
  const { data: entryData } = useMetaDeckEntries(teamId, meta.id);
  const entries = entryData?.data ?? [];

  function archive() {
    if (!window.confirm("Archive this meta? It will be hidden but its history is kept.")) return;
    archiveMeta.mutate(undefined, { onSuccess: () => void navigate({ to: "/metas" }) });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={meta.name}
        description={
          <div className="flex flex-wrap items-center gap-2">
            {isCurrent ? (
              <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                Current
              </span>
            ) : null}
            <span>
              {meta.formatName} · {formatMetaDate(meta.startDate)} → {formatMetaDate(meta.endDate)}
            </span>
          </div>
        }
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={archive} disabled={archiveMeta.isPending}>
              Archive
            </Button>
          </>
        }
      />

      {archiveMeta.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {archiveMeta.error instanceof ApiError
            ? archiveMeta.error.message
            : "Could not archive the meta."}
        </p>
      ) : null}

      {meta.description ? (
        <Section title="Description" aria-label="Description" bodyClassName="gap-1">
          <p className="whitespace-pre-wrap text-sm">{meta.description}</p>
        </Section>
      ) : null}

      <MetaDeckEntryBuilder teamId={teamId} metaId={meta.id} entries={entries} canEdit />

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit meta">
        <MetaForm
          teamId={teamId}
          meta={meta}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </Dialog>
    </div>
  );
}
