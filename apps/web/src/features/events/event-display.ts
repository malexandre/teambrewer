import type { Attendance, AttendanceStatus, TravelLegStatus, TravelPlan } from "@teambrewer/shared";
import { BedDouble, type LucideIcon, PlaneLanding, PlaneTakeoff } from "lucide-react";

import type { BadgeTone } from "@/components/ui/badge";

/** Human labels for a member's RSVP status. */
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  going: "Going",
  interested: "Interested",
};

/** Badge tone per RSVP: a committed "going" reads as success, "interested" as info. */
export const ATTENDANCE_STATUS_TONE: Record<AttendanceStatus, BadgeTone> = {
  going: "success",
  interested: "info",
};

/** Human labels for a travel leg's status. */
export const TRAVEL_LEG_STATUS_LABELS: Record<TravelLegStatus, string> = {
  sorted: "Sorted",
  searching: "Still looking",
  not_needed: "Not needed",
};

/**
 * One selectable option for a leg. A concrete method (plane, car, airbnb…) maps to a
 * `sorted` status whose `detail` is the method label; the two non-method options map to
 * `searching` / `not_needed`. This lets a single dropdown carry both "sorted with which
 * one" and the still-looking / not-needed states, with no free text.
 */
export interface TravelLegOption {
  value: string;
  label: string;
  status: TravelLegStatus;
  detail: string | null;
}

const SEARCHING_OPTION: TravelLegOption = {
  value: "searching",
  label: "Still looking",
  status: "searching",
  detail: null,
};
const NOT_NEEDED_OPTION: TravelLegOption = {
  value: "not_needed",
  label: "Not needed",
  status: "not_needed",
  detail: null,
};

/** A concrete "sorted" method whose stored detail is its own label. */
function methodOption(value: string, label: string): TravelLegOption {
  return { value, label, status: "sorted", detail: label };
}

const TRANSPORT_OPTIONS: readonly TravelLegOption[] = [
  methodOption("plane", "Plane"),
  methodOption("car", "Car"),
  methodOption("train", "Train"),
  methodOption("bus", "Bus"),
  methodOption("other", "Other"),
  SEARCHING_OPTION,
  NOT_NEEDED_OPTION,
];

const LODGING_OPTIONS: readonly TravelLegOption[] = [
  methodOption("airbnb", "Airbnb"),
  methodOption("hotel", "Hotel"),
  methodOption("other", "Other"),
  SEARCHING_OPTION,
  NOT_NEEDED_OPTION,
];

/** One leg of a trip, in display order, with its label, icon, and selectable options. */
export interface TravelLegDescriptor {
  key: keyof TravelPlan;
  label: string;
  icon: LucideIcon;
  options: readonly TravelLegOption[];
}

/** The three trip legs, in the order they are shown on a ticket / in the editor. */
export const TRAVEL_LEGS: readonly TravelLegDescriptor[] = [
  {
    key: "outboundTransport",
    label: "Getting there",
    icon: PlaneTakeoff,
    options: TRANSPORT_OPTIONS,
  },
  { key: "lodging", label: "Lodging", icon: BedDouble, options: LODGING_OPTIONS },
  { key: "returnTransport", label: "Getting back", icon: PlaneLanding, options: TRANSPORT_OPTIONS },
];

/**
 * The effective status of a leg for display and derivation: an unset (null) leg is
 * treated as `searching` — everyone is "still looking" by default until they say
 * otherwise, so a fresh going member reads as needing help rather than as blank.
 */
export function effectiveTravelLegStatus(status: TravelLegStatus | null): TravelLegStatus {
  return status ?? "searching";
}

/**
 * The dropdown option value that represents a stored leg. Non-sorted legs map to their
 * status; a sorted leg maps to the method matching its detail, falling back to "other"
 * (covering legacy free-text or an unrecognized method).
 */
export function travelLegOptionValue(
  status: TravelLegStatus | null,
  detail: string | null,
  options: readonly TravelLegOption[],
): string {
  const effective = effectiveTravelLegStatus(status);
  if (effective !== "sorted") {
    return effective;
  }
  const match = options.find(
    (option) =>
      option.status === "sorted" && detail && option.label.toLowerCase() === detail.toLowerCase(),
  );
  return match ? match.value : "other";
}

/** What a going member still needs help with, derived from their travel plan. */
export interface TravelNeeds {
  needsTransport: boolean;
  needsLodging: boolean;
}

/** Whether a plan still needs transport (either leg searching) and/or lodging. */
export function travelNeedsForPlan(plan: TravelPlan): TravelNeeds {
  const isSearching = (status: TravelLegStatus | null) =>
    effectiveTravelLegStatus(status) === "searching";
  return {
    needsTransport:
      isSearching(plan.outboundTransport.status) || isSearching(plan.returnTransport.status),
    needsLodging: isSearching(plan.lodging.status),
  };
}

/**
 * Tally, across the going members of a roster, how many still need transport and how many
 * still need lodging — the headline the roster's needs strip shows. Interested members
 * are ignored (travel is only meaningful for attendees).
 */
export function summarizeTravelNeeds(roster: Attendance[]): {
  transportCount: number;
  lodgingCount: number;
} {
  let transportCount = 0;
  let lodgingCount = 0;
  for (const entry of roster) {
    if (entry.status !== "going") continue;
    const needs = travelNeedsForPlan(entry.travel);
    if (needs.needsTransport) transportCount += 1;
    if (needs.needsLodging) lodgingCount += 1;
  }
  return { transportCount, lodgingCount };
}

/**
 * Format an event's calendar date without a timezone shift. The date is stored
 * (and serialized) at **UTC midnight**, so a naive `new Date(iso).toLocaleDateString()`
 * would render the *previous* day for any viewer west of UTC. Formatting in UTC
 * keeps the day the user actually picked.
 */
export function formatEventDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, { timeZone: "UTC" });
}
