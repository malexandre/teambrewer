import { useCardDataVersion } from "./use-card-data-version";

/**
 * Shows "card data as of …" with source attribution for the active team's game
 * (ADR-0007). Renders nothing until data has been synced (the endpoint 404s
 * before the first sync — a normal empty state).
 */
export function CardDataVersionBadge({ teamId }: { teamId: string | undefined }) {
  const { data } = useCardDataVersion(teamId);
  if (!data) {
    return null;
  }
  const syncedOn = new Date(data.lastSyncedAt).toLocaleDateString();
  return (
    <p className="text-xs text-muted-foreground">
      Card data as of {syncedOn} ({data.sourceVersion}) · source:{" "}
      <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="underline">
        {data.sourceName}
      </a>
    </p>
  );
}
