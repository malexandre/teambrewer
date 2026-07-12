import { useNavigate } from "@tanstack/react-router";
import type { Notification } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
  const [open, setOpen] = useState(false);

  const { data } = useNotifications(teamId);
  const markRead = useMarkNotificationRead(teamId);
  const markAllRead = useMarkAllNotificationsRead(teamId);

  const notifications = data?.data ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  function openSubject(notification: Notification): void {
    markRead.mutate(notification.id);
    setOpen(false);
    if (notification.subjectType === "deck") {
      void navigate({ to: "/decks/$deckId", params: { deckId: notification.subjectId } });
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="relative rounded-md px-2 py-1 hover:bg-muted"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden>🔔</span>
        {unreadCount > 0 ? (
          <span
            className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold text-primary-foreground"
            data-testid="notification-badge"
          >
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-md border border-border bg-popover p-2 text-sm shadow">
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
                    onClick={() => openSubject(notification)}
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
