import { useNavigate } from "@tanstack/react-router";
import type { MetaDetail as MetaDetailType } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";

import { MetaDeckEntryBuilder } from "./MetaDeckEntryBuilder";
import { formatMetaDate } from "./meta-display";
import { MetaForm } from "./MetaForm";
import { useArchiveMeta } from "./use-meta-mutations";
import { useMetaDeckEntries } from "./use-metas";

/**
 * A meta's detail: the organizing hub. Header (name, window), description, and the
 * tiered opponent-deck list. Permissions are a shared team board — any member may
 * edit the meta, its deck list, and archive it. Editing swaps in the form in place.
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

  if (editing) {
    return (
      <MetaForm
        teamId={teamId}
        meta={meta}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  function archive() {
    if (!window.confirm("Archive this meta? It will be hidden but its history is kept.")) return;
    archiveMeta.mutate(undefined, { onSuccess: () => void navigate({ to: "/metas" }) });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{meta.name}</h2>
          {isCurrent ? (
            <span className="rounded-md bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              Current
            </span>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={archive} disabled={archiveMeta.isPending}>
            Archive
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {formatMetaDate(meta.startDate)} → {formatMetaDate(meta.endDate)}
      </p>

      {archiveMeta.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {archiveMeta.error instanceof ApiError
            ? archiveMeta.error.message
            : "Could not archive the meta."}
        </p>
      ) : null}

      {meta.description ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Description</h3>
          <p className="whitespace-pre-wrap text-sm">{meta.description}</p>
        </section>
      ) : null}

      <MetaDeckEntryBuilder teamId={teamId} metaId={meta.id} entries={entries} canEdit />
    </div>
  );
}
