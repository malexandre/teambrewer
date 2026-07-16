import type { Attendance, SetTravelInput, TravelPlan } from "@teambrewer/shared";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api-client";

import { TRAVEL_LEGS, travelLegOptionValue } from "./event-display";
import { useSetMyTravel } from "./use-event-mutations";

const SELECT_CLASS = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

/** The selected dropdown option value per leg. */
type EditorPlan = Record<keyof TravelPlan, string>;

function planFromAttendance(attendance: Attendance): EditorPlan {
  const result = {} as EditorPlan;
  for (const leg of TRAVEL_LEGS) {
    const value = attendance.travel[leg.key];
    result[leg.key] = travelLegOptionValue(value.status, value.detail, leg.options);
  }
  return result;
}

/** Turn the selected option values back into the per-leg { status, detail } payload. */
function planToInput(plan: EditorPlan): SetTravelInput {
  const result = {} as SetTravelInput;
  for (const leg of TRAVEL_LEGS) {
    const option = leg.options.find((candidate) => candidate.value === plan[leg.key]);
    result[leg.key] =
      option && option.status === "sorted" && option.detail
        ? { status: option.status, detail: option.detail }
        : { status: option?.status ?? "searching" };
  }
  return result;
}

/**
 * The current member's inline "Your trip" editor, shown only when they are going. The
 * three legs (outbound transport, lodging, return transport) sit in one compact row, each
 * a single dropdown offering concrete methods (plane, car, airbnb…) plus "Still looking"
 * and "Not needed" — no free text. Each change saves immediately (no Save button), with a
 * quiet Saving/Saved status. Collapsible to stay out of the way.
 */
export function TripEditor({
  teamId,
  eventId,
  myAttendance,
}: {
  teamId: string | undefined;
  eventId: string;
  myAttendance: Attendance;
}) {
  const setMyTravel = useSetMyTravel(teamId, eventId);
  const [collapsed, setCollapsed] = useState(false);
  const [plan, setPlan] = useState<EditorPlan>(() => planFromAttendance(myAttendance));

  // Re-sync from the server only when the stored plan actually changes, not on every
  // render — otherwise a refetch would clobber edits in progress. Keyed on a serialized
  // snapshot of the stored plan so `myAttendance` identity churn doesn't reset edits.
  const storedPlanKey = JSON.stringify(myAttendance.travel);
  useEffect(() => {
    setPlan(planFromAttendance(myAttendance));
  }, [storedPlanKey]);

  function chooseLeg(key: keyof TravelPlan, value: string) {
    const next = { ...plan, [key]: value };
    setPlan(next);
    setMyTravel.mutate(planToInput(next));
  }

  const ChevronIcon = collapsed ? ChevronRight : ChevronDown;
  const saveStatus = setMyTravel.isPending ? "Saving…" : null;

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <ChevronIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          Your trip
        </button>
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {saveStatus}
        </span>
      </div>

      {collapsed ? null : (
        <div className="grid grid-cols-1 gap-3 px-3 pb-3 sm:grid-cols-3">
          {TRAVEL_LEGS.map((leg) => {
            const LegIcon = leg.icon;
            return (
              <div key={leg.key} className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <LegIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  {leg.label}
                </span>
                <select
                  className={SELECT_CLASS}
                  value={plan[leg.key]}
                  aria-label={leg.label}
                  onChange={(event) => chooseLeg(leg.key, event.target.value)}
                >
                  {leg.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {setMyTravel.isError ? (
        <p role="alert" className="px-3 pb-3 text-sm text-destructive">
          {setMyTravel.error instanceof ApiError
            ? setMyTravel.error.message
            : "Could not save your trip."}
        </p>
      ) : null}
    </div>
  );
}
