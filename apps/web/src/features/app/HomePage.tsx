import { MembersPanel } from "@/features/teams/MembersPanel";

/** The active team's roster (the `/team` view; the dashboard is now the landing at `/`). */
export function HomePage() {
  return (
    <div className="flex flex-col gap-4">
      <MembersPanel />
    </div>
  );
}
