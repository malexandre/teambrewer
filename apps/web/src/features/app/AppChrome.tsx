import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronsRight,
  FlaskConical,
  Layers,
  ListChecks,
  type LucideIcon,
  LogOut,
  PanelLeftClose,
  Settings,
  ShieldCheck,
  Swords,
  Target,
} from "lucide-react";
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
  icon: LucideIcon;
  /** True when the given pathname belongs to this section. */
  matches: (pathname: string) => boolean;
}

/** A sub-page shown in the section submenu for a section that has one. */
interface SubNavItem {
  label: string;
  to: string;
}

// The core sections. "Decks" owns the landing route `/` as well as `/decks*`.
const MAIN_NAV: NavItem[] = [
  {
    label: "Decks",
    to: "/decks",
    icon: Layers,
    matches: (pathname) =>
      pathname === "/" || pathname === "/decks" || pathname.startsWith("/decks/"),
  },
  {
    label: "Metas",
    to: "/metas",
    icon: Target,
    matches: (pathname) => pathname.startsWith("/metas"),
  },
  {
    label: "Events",
    to: "/events",
    icon: CalendarDays,
    matches: (pathname) => pathname.startsWith("/events"),
  },
  {
    label: "Games",
    to: "/games",
    icon: Swords,
    matches: (pathname) => pathname.startsWith("/games"),
  },
  {
    label: "Tasks",
    to: "/tasks",
    icon: ListChecks,
    matches: (pathname) => pathname.startsWith("/tasks"),
  },
];

const ADMIN_NAV: NavItem = {
  label: "Admin",
  to: "/admin/teams",
  icon: ShieldCheck,
  matches: (pathname) => pathname.startsWith("/admin"),
};

const SETTINGS_NAV: NavItem = {
  label: "Settings",
  to: "/settings",
  icon: Settings,
  matches: (pathname) => pathname.startsWith("/settings"),
};

// Admin is the one section with sub-pages (WS-7). Others show no submenu.
const ADMIN_SUBNAV: SubNavItem[] = [
  { label: "Teams", to: "/admin/teams" },
  { label: "Accounts", to: "/admin/accounts" },
  { label: "Members", to: "/admin/members" },
];

const SIDEBAR_COLLAPSED_KEY = "teambrewer-sidebar-collapsed";

/** Two-letter initials for the account avatar (first letters of the name's words). */
function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

/** The list of main-menu links, shared by the desktop sidebar and mobile drawer. */
function MainMenu({
  pathname,
  canAdminister,
  collapsed = false,
  onNavigate,
}: {
  pathname: string;
  canAdminister: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const items = [...MAIN_NAV, ...(canAdminister ? [ADMIN_NAV] : []), SETTINGS_NAV];
  return (
    <nav
      aria-label="Main"
      className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2 text-sm"
    >
      {items.map((item) => {
        const active = item.matches(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            title={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 font-medium transition-colors",
              collapsed && "justify-center px-0",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden="true" />
            <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** The section submenu (Admin) — a slim in-content tab bar for a section's sub-pages. */
function SubMenu({ items, pathname }: { items: SubNavItem[]; pathname: string }) {
  return (
    <nav
      aria-label="Section"
      className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2 text-sm"
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
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The sidebar foot: active-team switcher, the connected account, and the sign-out +
 * theme controls. Owns the identity surface the old top header used to hold.
 */
function SidebarFooter({
  collapsed = false,
  accountName,
  accountSub,
  onSignOut,
}: {
  collapsed?: boolean;
  accountName: string;
  accountSub: string;
  onSignOut: () => void;
}) {
  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-border p-2">
      {collapsed ? null : (
        <div className="flex items-center gap-2">
          <TeamSelector />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      )}
      <div className={cn("flex items-center gap-2", collapsed && "flex-col")}>
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
          title={accountName}
          aria-hidden="true"
        >
          {initialsFor(accountName)}
        </span>
        {collapsed ? null : (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold">{accountName}</span>
            <span className="truncate text-xs text-muted-foreground">{accountSub}</span>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(!collapsed && "ml-auto")}
          aria-label="Sign out"
          title="Sign out"
          onClick={onSignOut}
        >
          <LogOut className="size-[18px]" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/** Navigation, identity, and layout shared by every authenticated screen. */
export function AppChrome({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { teams } = useActiveTeam();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(
    () => globalThis.localStorage?.getItem(SIDEBAR_COLLAPSED_KEY) === "true",
  );

  const canAdminister =
    Boolean(user?.isInstanceAdmin) || teams.some((team) => team.role === "team_admin");

  const accountName = user?.displayName ?? user?.username ?? "Account";
  const accountSub = user?.username ? `@${user.username}` : "";

  // Persist the collapsed preference so it survives reloads.
  useEffect(() => {
    globalThis.localStorage?.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

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
    <div className="min-h-dvh bg-background md:flex">
      {/* Persistent sidebar (desktop and up). */}
      <aside
        className={cn(
          // Sticky + viewport-tall so the footer (mt-auto) pins to the bottom of the
          // screen, not the bottom of a long page.
          "hidden shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 md:sticky md:top-0 md:flex md:h-dvh",
          isCollapsed ? "w-16" : "w-56",
        )}
      >
        <div
          className={cn("flex h-14 items-center gap-2 px-3", isCollapsed && "justify-center px-0")}
        >
          <Link
            to="/"
            title="TeamBrewer"
            className="flex items-center gap-2 overflow-hidden font-semibold tracking-tight"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
              <FlaskConical className="size-[18px]" aria-hidden="true" />
            </span>
            <span className={cn("text-lg", isCollapsed && "sr-only")}>TeamBrewer</span>
          </Link>
          {isCollapsed ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              onClick={() => setIsCollapsed(true)}
            >
              <PanelLeftClose className="size-[18px]" aria-hidden="true" />
            </Button>
          )}
        </div>

        {isCollapsed ? (
          // A binder-style tab that reaches out past the rail's right edge, level
          // with the logo — click to expand the sidebar back to full width.
          <button
            type="button"
            aria-label="Expand sidebar"
            title="Expand sidebar"
            onClick={() => setIsCollapsed(false)}
            className="absolute -right-5 top-3 z-30 grid h-9 w-5 place-items-center rounded-r-md border border-l-0 border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronsRight className="size-4" aria-hidden="true" />
          </button>
        ) : null}

        <MainMenu pathname={pathname} canAdminister={canAdminister} collapsed={isCollapsed} />
        <SidebarFooter
          collapsed={isCollapsed}
          accountName={accountName}
          accountSub={accountSub}
          onSignOut={signOut}
        />
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
            className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-card shadow-lg"
          >
            <div className="flex items-center justify-between p-4">
              <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <FlaskConical className="size-[18px]" aria-hidden="true" />
                </span>
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
            <SidebarFooter accountName={accountName} accountSub={accountSub} onSignOut={signOut} />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-dvh flex-1 flex-col">
        {/* Slim mobile bar: just the drawer trigger (desktop navigates from the sidebar). */}
        <header className="flex items-center gap-3 border-b border-border bg-card p-3 md:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Open menu"
            aria-expanded={isDrawerOpen}
            aria-controls="mobile-menu"
            onClick={() => setIsDrawerOpen(true)}
          >
            Menu
          </Button>
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <FlaskConical className="size-4" aria-hidden="true" />
            </span>
            TeamBrewer
          </Link>
        </header>
        {showAdminSubMenu ? <SubMenu items={ADMIN_SUBNAV} pathname={pathname} /> : null}
        <main className="mx-auto w-full max-w-[1200px] flex-1 p-4 md:p-6">{children}</main>
      </div>

      {/* Floating notification button (top-right of the viewport). */}
      <NotificationCenter />
    </div>
  );
}
