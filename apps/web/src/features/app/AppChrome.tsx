import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { clearPersistedQueryCache } from "@/app/query-persistence";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { NotificationCenter } from "@/features/collaboration/NotificationCenter";
import { useActiveTeam } from "@/features/teams/active-team";
import { TeamSelector } from "@/features/teams/TeamSelector";
import { ThemeToggle } from "@/features/app/ThemeToggle";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/** A main-menu entry, with the matcher deciding when it reads as active. */
interface NavItem {
  label: string;
  to: string;
  /** True when the given pathname belongs to this section. */
  matches: (pathname: string) => boolean;
}

/** A sub-page shown in the top submenu bar for a section that has one. */
interface SubNavItem {
  label: string;
  to: string;
}

// The core sections. "Decks" owns the landing route `/` as well as `/decks*`.
const MAIN_NAV: NavItem[] = [
  {
    label: "Decks",
    to: "/decks",
    matches: (pathname) =>
      pathname === "/" || pathname === "/decks" || pathname.startsWith("/decks/"),
  },
  { label: "Metas", to: "/metas", matches: (pathname) => pathname.startsWith("/metas") },
  { label: "Events", to: "/events", matches: (pathname) => pathname.startsWith("/events") },
  { label: "Games", to: "/games", matches: (pathname) => pathname.startsWith("/games") },
  { label: "Tasks", to: "/tasks", matches: (pathname) => pathname.startsWith("/tasks") },
];

const ADMIN_NAV: NavItem = {
  label: "Admin",
  to: "/admin/teams",
  matches: (pathname) => pathname.startsWith("/admin"),
};

const SETTINGS_NAV: NavItem = {
  label: "Settings",
  to: "/settings",
  matches: (pathname) => pathname.startsWith("/settings"),
};

// Admin is the one section with sub-pages (WS-7). Others show no submenu.
const ADMIN_SUBNAV: SubNavItem[] = [
  { label: "Teams", to: "/admin/teams" },
  { label: "Accounts", to: "/admin/accounts" },
  { label: "Members", to: "/admin/members" },
];

/** The list of main-menu links, shared by the desktop sidebar and mobile drawer. */
function MainMenu({
  pathname,
  canAdminister,
  onNavigate,
}: {
  pathname: string;
  canAdminister: boolean;
  onNavigate?: () => void;
}) {
  const items = [...MAIN_NAV, ...(canAdminister ? [ADMIN_NAV] : []), SETTINGS_NAV];
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-2 text-sm">
      {items.map((item) => {
        const active = item.matches(pathname);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The submenu bar for a section with sub-pages (Admin). */
function SubMenu({ items, pathname }: { items: SubNavItem[]; pathname: string }) {
  return (
    <nav
      aria-label="Section"
      className="flex gap-1 overflow-x-auto border-b border-border bg-card px-4 py-2 text-sm"
    >
      {items.map((item) => {
        const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Header + navigation shared by every authenticated screen. */
export function AppChrome({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { teams } = useActiveTeam();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const canAdminister =
    Boolean(user?.isInstanceAdmin) || teams.some((team) => team.role === "team_admin");

  // Close the mobile drawer whenever navigation lands on a new route.
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [pathname]);

  // Escape closes the drawer (keyboard accessibility).
  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDrawerOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDrawerOpen]);

  const showAdminSubMenu = canAdminister && pathname.startsWith("/admin");

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    // Drop the on-disk cache too so nothing survives for the next user on a
    // shared device (tenant/privacy safety).
    await clearPersistedQueryCache();
    await navigate({ to: "/login" });
  }

  return (
    <div className="min-h-dvh bg-muted/40 md:flex dark:bg-background">
      {/* Persistent sidebar (desktop and up). */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="border-b border-border p-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            TeamBrewer
          </Link>
        </div>
        <MainMenu pathname={pathname} canAdminister={canAdminister} />
      </aside>

      {/* Mobile drawer. */}
      {isDrawerOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setIsDrawerOpen(false)}
          />
          <div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-background shadow-lg"
          >
            <div className="flex items-center justify-between p-4">
              <Link to="/" className="text-lg font-semibold tracking-tight">
                TeamBrewer
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsDrawerOpen(false)}
              >
                Close
              </Button>
            </div>
            <MainMenu
              pathname={pathname}
              canAdminister={canAdminister}
              onNavigate={() => setIsDrawerOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="border-b border-border bg-card">
          <div className="flex items-center gap-3 p-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="md:hidden"
              aria-label="Open menu"
              aria-expanded={isDrawerOpen}
              aria-controls="mobile-menu"
              onClick={() => setIsDrawerOpen(true)}
            >
              Menu
            </Button>
            <TeamSelector />
            <div className="ml-auto flex items-center gap-2">
              <NotificationCenter />
              <ThemeToggle />
              <Button type="button" variant="ghost" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </div>
        </header>
        {showAdminSubMenu ? <SubMenu items={ADMIN_SUBNAV} pathname={pathname} /> : null}
        <main className="mx-auto w-full max-w-4xl flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}
