import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { clearPersistedQueryCache } from "@/app/query-persistence";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { NotificationCenter } from "@/features/collaboration/NotificationCenter";
import { useActiveTeam } from "@/features/teams/active-team";
import { TeamSelector } from "@/features/teams/TeamSelector";
import { ThemeToggle } from "@/features/app/ThemeToggle";
import { authClient } from "@/lib/auth-client";

/** Header + navigation shared by every authenticated screen. */
export function AppChrome({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { teams } = useActiveTeam();

  const canAdminister =
    Boolean(user?.isInstanceAdmin) || teams.some((team) => team.role === "team_admin");

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    // Drop the on-disk cache too so nothing survives for the next user on a
    // shared device (tenant/privacy safety).
    await clearPersistedQueryCache();
    await navigate({ to: "/login" });
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-lg font-semibold tracking-tight">
              TeamBrewer
            </Link>
            <TeamSelector />
          </div>
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/decks" className="px-2 py-1 hover:underline">
              Decks
            </Link>
            <Link to="/events" className="px-2 py-1 hover:underline">
              Events
            </Link>
            <Link to="/games" className="px-2 py-1 hover:underline">
              Games
            </Link>
            <Link to="/assignments" className="px-2 py-1 hover:underline">
              Assignments
            </Link>
            {canAdminister ? (
              <Link to="/admin" className="px-2 py-1 hover:underline">
                Admin
              </Link>
            ) : null}
            <Link to="/settings" className="px-2 py-1 hover:underline">
              Settings
            </Link>
            <NotificationCenter />
            <ThemeToggle />
            <Button type="button" variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4">{children}</main>
    </div>
  );
}
