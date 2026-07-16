import type { Attendance, TravelLegStatus } from "@teambrewer/shared";
import { AlertTriangle, Check, type LucideIcon, MinusCircle } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import {
  effectiveTravelLegStatus,
  TRAVEL_LEG_STATUS_LABELS,
  TRAVEL_LEGS,
  travelNeedsForPlan,
} from "./event-display";

/** The status marker + text color for one leg line. */
function legAppearance(status: TravelLegStatus): { icon: LucideIcon; textClassName: string } {
  switch (status) {
    case "sorted":
      return { icon: Check, textClassName: "text-success-foreground" };
    case "searching":
      return { icon: AlertTriangle, textClassName: "text-warning-strong" };
    case "not_needed":
      return { icon: MinusCircle, textClassName: "text-muted-foreground" };
  }
}

/** The right-hand stub's tone + label, reflecting the member's neediest leg. */
function ticketStub(attendance: Attendance): {
  label: string;
  containerClassName: string;
  borderClassName: string;
} {
  const needs = travelNeedsForPlan(attendance.travel);

  if (needs.needsTransport && needs.needsLodging) {
    return warningStub("Needs help");
  }
  if (needs.needsTransport) {
    return warningStub("Needs ride");
  }
  if (needs.needsLodging) {
    return warningStub("Needs stay");
  }
  return {
    label: "All set",
    containerClassName: "bg-success text-success-foreground",
    borderClassName: "border-success-border",
  };
}

function warningStub(label: string) {
  return {
    label,
    containerClassName: "bg-warning text-warning-foreground",
    borderClassName: "border-warning-border",
  };
}

/**
 * A going member rendered as a boarding pass: passenger identity (avatar + name +
 * @username), the three trip legs with their status, a perforated stub whose tone calls
 * out whether they still need help, and a torn-ticket notch cut into the left edge.
 * Read-only — a member edits their own trip in the inline "Your trip" editor.
 */
export function AttendeeTicket({ attendance }: { attendance: Attendance }) {
  const stub = ticketStub(attendance);
  const username = attendance.user.username;

  return (
    <div className="relative">
      <div className={cn("flex overflow-hidden rounded-lg border bg-card", stub.borderClassName)}>
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 pl-4">
          <div className="flex items-center gap-2.5">
            <Avatar name={attendance.user.displayName} />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">{attendance.user.displayName}</span>
              {username ? (
                <span className="truncate text-xs text-muted-foreground">@{username}</span>
              ) : null}
            </div>
          </div>

          <ul className="flex flex-col gap-1.5">
            {TRAVEL_LEGS.map((leg) => {
              const value = attendance.travel[leg.key];
              const status = effectiveTravelLegStatus(value.status);
              const appearance = legAppearance(status);
              const StatusIcon = appearance.icon;
              const LegIcon = leg.icon;
              const text =
                status === "sorted" && value.detail
                  ? value.detail
                  : TRAVEL_LEG_STATUS_LABELS[status];
              return (
                <li key={leg.key} className="flex items-center gap-2 text-xs">
                  <LegIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className={cn("flex min-w-0 items-center gap-1", appearance.textClassName)}>
                    <StatusIcon aria-hidden="true" className="size-3 shrink-0" />
                    <span className="truncate">
                      <span className="sr-only">{leg.label}: </span>
                      {text}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div
          className={cn(
            "flex w-9 items-center justify-center border-l border-dashed",
            stub.containerClassName,
            stub.borderClassName,
          )}
        >
          <span
            className="text-[0.65rem] font-semibold uppercase tracking-wide"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {stub.label}
          </span>
        </div>
      </div>

      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0 top-1/2 h-3/5 w-1 -translate-y-1/2 rounded-r-full border border-l-0 bg-card",
          stub.borderClassName,
        )}
      />
    </div>
  );
}
