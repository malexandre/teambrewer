import type { MatchupMatrixResponse } from "@teambrewer/shared";
import { useMemo } from "react";

import { EmptyMatchupCell, MatchupCellView } from "./MatchupCellView";
import { type MatchupScope, useMatchupMatrix } from "./use-matchups";

/**
 * The matchup matrix: our decks/heroes (rows) × the opponent field (columns). Each
 * filled cell shows the weighted win rate with raw N and a trust badge. Responsive:
 * the whole grid scrolls horizontally with a sticky first column so the row labels
 * stay put on a phone.
 */
export function MatchupMatrix({
  teamId,
  scope,
}: {
  teamId: string | undefined;
  scope: MatchupScope | undefined;
}) {
  const { data, isPending, isError } = useMatchupMatrix(teamId, scope);

  // Index cells by "rowKey|columnKey" for O(1) lookup while rendering the grid.
  const cellByPosition = useMemo(() => {
    const index = new Map<string, MatchupMatrixResponse["cells"][number]>();
    for (const cell of data?.cells ?? []) {
      index.set(`${cell.rowKey}|${cell.columnKey}`, cell);
    }
    return index;
  }, [data]);

  if (!scope) {
    return <p className="text-sm text-muted-foreground">Pick a format to see the matrix.</p>;
  }
  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading the matrix…</p>;
  }
  if (isError) {
    return <p className="text-sm text-destructive">Could not load the matrix.</p>;
  }
  if (data.rows.length === 0 || data.columns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No games logged yet for this scope — log some games to build the matrix.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-background p-2 text-sm font-medium">
              Our deck vs.
            </th>
            {data.columns.map((column) => (
              <th key={column.key} className="min-w-28 p-2 text-sm font-medium">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.key} className="border-t border-border">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-background p-2 text-sm font-medium whitespace-nowrap"
              >
                {row.name}
              </th>
              {data.columns.map((column) => {
                const cell = cellByPosition.get(`${row.key}|${column.key}`);
                return (
                  <td key={column.key} className="border-t border-border p-2 align-top">
                    {cell ? <MatchupCellView cell={cell} /> : <EmptyMatchupCell />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
