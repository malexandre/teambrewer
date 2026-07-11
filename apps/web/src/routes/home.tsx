import { HealthStatus } from "@/features/health/HealthStatus";

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">TeamBrewer</h1>
      <p className="text-muted-foreground">
        Foundation shell. Feature modules arrive from phase-01 onward.
      </p>
      <HealthStatus />
    </main>
  );
}
