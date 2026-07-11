import { MembersPanel } from "@/features/teams/MembersPanel";

/** Authenticated landing: the active team's roster (the phase-01 team view). */
export function HomePage() {
  return (
    <div className="flex flex-col gap-4">
      <MembersPanel />
    </div>
  );
}
