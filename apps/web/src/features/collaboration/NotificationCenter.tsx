import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Notification } from "@teambrewer/shared";
import { Bell } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { gamePlanQueryOptions } from "@/features/gameplans/use-game-plans";
import { useActiveTeam } from "@/features/teams/active-team";

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "./use-notifications";

/** A short human sentence for a notification. */
function describe(notification: Notification): string {
  const actor = notification.actor?.displayName ?? "A teammate";
  if (notification.type === "mention") {
    return `${actor} mentioned you`;
  }
  return `${actor} sent you a notification`;
}

/**
 * The in-app notification center: a bell with an unread badge and a panel listing
 * the caller's notifications for the active team (no email/push — ADR-0003).
 * Clicking one marks it read and deep-links to its subject; "mark all read"
 * clears the badge.
 */
export function NotificationCenter() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useNotifications(teamId);
  const markRead = useMarkNotificationRead(teamId);
  const markAllRead = useMarkAllNotificationsRead(teamId);

  const notifications = data?.data ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  /**
   * Mark read and deep-link to the notification's source, landing on the right place per
   * subject type and anchoring the originating comment (`#comment-<id>`) so it is scrolled
   * to and briefly highlighted. A game-plan carries no deck reference, so its parent deck
   * is resolved on demand before navigating to the deck's Plan tab.
   */
  async function openSubject(notification: Notification): Promise<void> {
    markRead.mutate(notification.id);
    setOpen(false);
    // Include the anchor only when a comment is present — TanStack's navigate rejects an
    // explicit `hash: undefined` under exactOptionalPropertyTypes.
    const hashOption = notification.commentId ? { hash: `comment-${notification.commentId}` } : {};
    switch (notification.subjectType) {
      case "deck":
        // The discussion lives on the deck's default (General) tab.
        return void navigate({
          to: "/decks/$deckId",
          params: { deckId: notification.subjectId },
          ...hashOption,
        });
      case "game_log":
        return void navigate({
          to: "/games/$gameLogId",
          params: { gameLogId: notification.subjectId },
          ...hashOption,
        });
      case "task":
        return void navigate({
          to: "/tasks/{-$taskId}",
          params: { taskId: notification.subjectId },
          ...hashOption,
        });
      case "matchup_game_plan": {
        if (!teamId) return;
        const plan = await queryClient.fetchQuery(
          gamePlanQueryOptions(teamId, notification.subjectId),
        );
        return void navigate({
          to: "/decks/$deckId/$deckTab",
          params: { deckId: plan.ourDeckId, deckTab: "plan" },
          ...hashOption,
        });
      }
    }
  }

  return (
    <div className="fixed right-4 top-4 z-40">
      <button
        type="button"
        className="relative grid size-10 place-items-center rounded-xl border border-border bg-card text-foreground shadow-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="size-[18px]" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full border-2 border-card bg-danger-foreground px-1 text-[10px] font-bold text-card"
            data-testid="notification-badge"
          >
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-lg border border-border bg-popover p-2 text-sm shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">Notifications</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={unreadCount === 0 || markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </Button>
          </div>
          {notifications.length === 0 ? (
            <p className="p-2 text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-1 overflow-auto">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    className={`w-full rounded-md p-2 text-left hover:bg-muted ${
                      notification.readAt === null ? "font-medium" : "text-muted-foreground"
                    }`}
                    onClick={() => void openSubject(notification)}
                  >
                    {describe(notification)}
                    <span className="block text-xs text-muted-foreground">
                      {new Date(notification.createdAt).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
