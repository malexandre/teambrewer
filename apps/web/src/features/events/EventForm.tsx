import { type CreateEventInput, type EventDetail, type UpdateEventInput } from "@teambrewer/shared";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMetas } from "@/features/metas/use-metas";
import { ApiError } from "@/lib/api-client";

import { SELECT_CLASS } from "./event-display";
import { useCreateEvent, useUpdateEvent } from "./use-event-mutations";

/** The `YYYY-MM-DD` value a native date input expects, from an ISO date string. */
function toDateInputValue(isoDate: string | undefined): string {
  if (!isoDate) return "";
  return isoDate.slice(0, 10);
}

/**
 * Create or edit an event: a name, a date, an optional location/description, and an
 * optional link to a meta. The organizing hub is the Meta, so an event carries no
 * format, importance, or status.
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
  const [date, setDate] = useState(toDateInputValue(event?.date));
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [metaId, setMetaId] = useState(event?.metaId ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: metaData } = useMetas(teamId);
  const metas = metaData?.data ?? [];

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
    if (!date) {
      setValidationError("An event date is required.");
      return;
    }

    if (isEditing && event) {
      const input: UpdateEventInput = {
        name: name.trim(),
        date,
        location: location.trim() ? location.trim() : null,
        description,
        // null clears the link; a chosen id sets it.
        metaId: metaId ? metaId : null,
      };
      updateEvent.mutate(input, { onSuccess: onSaved });
      return;
    }

    const input: CreateEventInput = {
      name: name.trim(),
      date,
      ...(location.trim() ? { location: location.trim() } : {}),
      description,
      ...(metaId ? { metaId } : {}),
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
          <Label htmlFor="event-date">Date</Label>
          <Input
            id="event-date"
            type="date"
            value={date}
            onChange={(changeEvent) => setDate(changeEvent.target.value)}
          />
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
        <Label htmlFor="event-meta">Meta (optional)</Label>
        <select
          id="event-meta"
          className={SELECT_CLASS}
          value={metaId}
          onChange={(changeEvent) => setMetaId(changeEvent.target.value)}
        >
          <option value="">No meta</option>
          {metas.map((meta) => (
            <option key={meta.id} value={meta.id}>
              {meta.name}
            </option>
          ))}
        </select>
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
