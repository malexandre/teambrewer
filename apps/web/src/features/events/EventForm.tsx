import {
  type CreateEventInput,
  type EventDetail,
  type EventImportance,
  eventImportanceSchema,
  type UpdateEventInput,
} from "@teambrewer/shared";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormatPicker } from "@/features/decks/FormatPicker";
import { ApiError } from "@/lib/api-client";

import { EVENT_IMPORTANCE_LABELS, SELECT_CLASS } from "./event-display";
import { useCreateEvent, useUpdateEvent } from "./use-event-mutations";

/** The `YYYY-MM-DD` value a native date input expects, from an ISO date string. */
function toDateInputValue(isoDate: string | undefined): string {
  if (!isoDate) return "";
  return isoDate.slice(0, 10);
}

/**
 * Create or edit an event: a name, a format from the game's reference data, a date,
 * an importance, and an optional location/description. Status is not edited here —
 * it advances through the status control on the event hub.
 */
export function EventForm({
  teamId,
  event,
  onSaved,
  onCancel,
}: {
  teamId: string | undefined;
  event?: EventDetail;
  onSaved: (event: EventDetail) => void;
  onCancel?: () => void;
}) {
  const isEditing = Boolean(event);
  const [name, setName] = useState(event?.name ?? "");
  const [formatId, setFormatId] = useState(event?.formatId ?? "");
  const [date, setDate] = useState(toDateInputValue(event?.date));
  const [importance, setImportance] = useState<EventImportance>(event?.importance ?? "regional");
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  const createEvent = useCreateEvent(teamId);
  const updateEvent = useUpdateEvent(teamId, event?.id ?? "");
  const mutation = isEditing ? updateEvent : createEvent;

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setValidationError(null);

    if (!name.trim()) {
      setValidationError("An event name is required.");
      return;
    }
    if (!formatId) {
      setValidationError("A format is required.");
      return;
    }
    if (!date) {
      setValidationError("An event date is required.");
      return;
    }

    if (isEditing && event) {
      const input: UpdateEventInput = {
        name: name.trim(),
        formatId,
        date,
        importance,
        location: location.trim() ? location.trim() : null,
        description,
      };
      updateEvent.mutate(input, { onSuccess: onSaved });
      return;
    }

    const input: CreateEventInput = {
      name: name.trim(),
      formatId,
      date,
      importance,
      ...(location.trim() ? { location: location.trim() } : {}),
      description,
    };
    createEvent.mutate(input, { onSuccess: onSaved });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="event-name">Name</Label>
        <Input
          id="event-name"
          value={name}
          onChange={(changeEvent) => setName(changeEvent.target.value)}
          placeholder="e.g. Calling: Sydney"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="event-format">Format</Label>
          <FormatPicker id="event-format" teamId={teamId} value={formatId} onChange={setFormatId} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="event-date">Date</Label>
          <Input
            id="event-date"
            type="date"
            value={date}
            onChange={(changeEvent) => setDate(changeEvent.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="event-importance">Importance</Label>
          <select
            id="event-importance"
            className={SELECT_CLASS}
            value={importance}
            onChange={(changeEvent) => setImportance(changeEvent.target.value as EventImportance)}
          >
            {eventImportanceSchema.options.map((option) => (
              <option key={option} value={option}>
                {EVENT_IMPORTANCE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="event-location">Location</Label>
          <Input
            id="event-location"
            value={location}
            onChange={(changeEvent) => setLocation(changeEvent.target.value)}
            placeholder="Optional venue / city"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="event-description">Description</Label>
        <textarea
          id="event-description"
          className="min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm"
          value={description}
          onChange={(changeEvent) => setDescription(changeEvent.target.value)}
        />
      </div>

      {validationError ? (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      ) : null}
      {mutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : "Could not save the event."}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {isEditing ? "Save changes" : "Create event"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
