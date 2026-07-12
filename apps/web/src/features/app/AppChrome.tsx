import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";
import { TeamSelector } from "@/features/teams/TeamSelector";
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
    await queryClient.invalidateQueries();
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
            <Link to="/" className="px-2 py-1 hover:underline">
              Team
            </Link>
            <Link to="/cards" className="px-2 py-1 hover:underline">
              Cards
            </Link>
            {canAdminister ? (
              <Link to="/admin" className="px-2 py-1 hover:underline">
                Admin
              </Link>
            ) : null}
            <Link to="/settings" className="px-2 py-1 hover:underline">
              Settings
            </Link>
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
