import { useHealth } from "./useHealth";

/**
 * Renders the live API health, proving the full contract path end to end:
 * web → /api/health → shared schema → rendered status.
 */
export function HealthStatus() {
  const { data, isPending, isError } = useHealth();

  if (isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        Checking API health…
      </p>
    );
  }

  if (isError) {
    return (
      <p role="status" className="text-destructive">
        API unavailable
      </p>
    );
  }

  return (
    <p role="status" className="text-muted-foreground">
      API status: {data.status}
    </p>
  );
}
