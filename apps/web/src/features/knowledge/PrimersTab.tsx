import type { PrimerKind } from "@teambrewer/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { PrimerEditor } from "./PrimerEditor";
import { usePrimers } from "./use-primers";

const KIND_LABELS: Record<PrimerKind, string> = {
  deck_primer: "Deck primer",
  matchup: "Matchup",
  format_notes: "Format notes",
  other: "Other",
};

const KIND_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All kinds" },
  { value: "deck_primer", label: "Deck primers" },
  { value: "matchup", label: "Matchups" },
  { value: "format_notes", label: "Format notes" },
  { value: "other", label: "Other" },
];

/** The primers library: a filterable list of primer cards linking to each read view. */
export function PrimersTab({ teamId }: { teamId: string | undefined }) {
  const [kind, setKind] = useState("");
  const [writing, setWriting] = useState(false);
  const { data, isPending } = usePrimers(teamId, kind ? { kind } : {});
  const primers = data?.data ?? [];

  return (
    <section className="flex flex-col gap-3" aria-label="Primers">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          className="rounded-md border border-input bg-background p-2 text-sm"
          aria-label="Filter by kind"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          {KIND_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {!writing ? (
          <Button type="button" size="sm" onClick={() => setWriting(true)}>
            Write a primer
          </Button>
        ) : null}
      </div>

      {writing ? <PrimerEditor teamId={teamId} onDone={() => setWriting(false)} /> : null}

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading primers…</p>
      ) : primers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No primers yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {primers.map((primer) => (
            <li key={primer.id}>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    <Link
                      to="/knowledge/primers/$primerId"
                      params={{ primerId: primer.id }}
                      className="hover:underline"
                    >
                      {primer.title}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5">{KIND_LABELS[primer.kind]}</span>
                  {primer.relatedDeckName ? <span>· {primer.relatedDeckName}</span> : null}
                  {primer.visibility === "private" ? <span>· Private</span> : null}
                  <span>· by {primer.author.displayName}</span>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
