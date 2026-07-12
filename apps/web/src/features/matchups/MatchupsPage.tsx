import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormats } from "@/features/cards/use-formats";
import { FormatPicker } from "@/features/decks/FormatPicker";
import { useEvents } from "@/features/events/use-events";
import { useActiveTeam } from "@/features/teams/active-team";

import { CoverageTracker } from "./CoverageTracker";
import { MatchupMatrix } from "./MatchupMatrix";
import { SELECT_CLASS } from "./matchup-display";
import type { MatchupScope } from "./use-matchups";

/**
 * The matchups hub: the confidence-weighted matrix and the event coverage tracker,
 * with scope selectors for format and event and a by-deck ↔ by-hero toggle. The
 * matrix always shows raw N + trust; coverage prioritizes the thin matchups.
 */
export function MatchupsPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;

  const { data: formatData } = useFormats(teamId);
  const formats = formatData?.data ?? [];

  const [formatId, setFormatId] = useState("");
  const [eventId, setEventId] = useState("");
  const [byHero, setByHero] = useState(false);

  // Default the format to the first available once reference data loads.
  const effectiveFormatId = formatId || formats[0]?.id || "";

  // Only offer events in the chosen format (their gauntlet defines the columns).
  const { data: eventData } = useEvents(
    teamId,
    effectiveFormatId ? { formatId: effectiveFormatId } : {},
  );
  const events = useMemo(() => eventData?.data ?? [], [eventData]);

  const scope: MatchupScope | undefined = effectiveFormatId
    ? {
        formatId: effectiveFormatId,
        ...(eventId ? { eventId } : {}),
        byHero,
      }
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Matchups</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Format</span>
              <FormatPicker teamId={teamId} value={formatId} onChange={setFormatId} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Event</span>
              <select
                className={SELECT_CLASS}
                value={eventId}
                onChange={(event) => setEventId(event.target.value)}
                aria-label="Event"
              >
                <option value="">All events (format-wide)</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={byHero}
                onChange={(event) => setByHero(event.target.checked)}
                aria-label="Group by hero"
              />
              <span>By hero</span>
            </label>
          </div>

          <MatchupMatrix teamId={teamId} scope={scope} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <CoverageTracker teamId={teamId} eventId={eventId || undefined} byHero={byHero} />
        </CardContent>
      </Card>
    </div>
  );
}
