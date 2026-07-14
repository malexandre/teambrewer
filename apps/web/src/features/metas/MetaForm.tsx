import { type CreateMetaInput, type MetaDetail, type UpdateMetaInput } from "@teambrewer/shared";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormats } from "@/features/cards/use-formats";
import { ApiError } from "@/lib/api-client";

import { SELECT_CLASS, toDateInputValue } from "./meta-display";
import { useCreateMeta, useUpdateMeta } from "./use-meta-mutations";

/**
 * Create or edit a meta: a name, the format it covers, a start/end date window, and an
 * optional prose description. The format is required; the window ordering is validated
 * client-side before submit; the API re-checks both authoritatively.
 */
export function MetaForm({
  teamId,
  meta,
  onSaved,
  onCancel,
}: {
  teamId: string | undefined;
  meta?: MetaDetail;
  onSaved: (meta: MetaDetail) => void;
  onCancel?: () => void;
}) {
  const isEditing = Boolean(meta);
  const [name, setName] = useState(meta?.name ?? "");
  const [formatId, setFormatId] = useState(meta?.formatId ?? "");
  const [startDate, setStartDate] = useState(toDateInputValue(meta?.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(meta?.endDate));
  const [description, setDescription] = useState(meta?.description ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: formatData } = useFormats(teamId);
  const formats = formatData?.data ?? [];

  const createMeta = useCreateMeta(teamId);
  const updateMeta = useUpdateMeta(teamId, meta?.id ?? "");
  const mutation = isEditing ? updateMeta : createMeta;

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setValidationError(null);

    if (!name.trim()) {
      setValidationError("A meta name is required.");
      return;
    }
    if (!formatId) {
      setValidationError("A format is required.");
      return;
    }
    if (!startDate) {
      setValidationError("A start date is required.");
      return;
    }
    if (!endDate) {
      setValidationError("An end date is required.");
      return;
    }
    if (Date.parse(endDate) < Date.parse(startDate)) {
      setValidationError("The end date must be on or after the start date.");
      return;
    }

    if (isEditing && meta) {
      const input: UpdateMetaInput = {
        name: name.trim(),
        formatId,
        startDate,
        endDate,
        description,
      };
      updateMeta.mutate(input, { onSuccess: onSaved });
      return;
    }

    const input: CreateMetaInput = {
      name: name.trim(),
      formatId,
      startDate,
      endDate,
      description,
    };
    createMeta.mutate(input, { onSuccess: onSaved });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="meta-name">Name</Label>
        <Input
          id="meta-name"
          value={name}
          onChange={(changeEvent) => setName(changeEvent.target.value)}
          placeholder="e.g. Summer Season"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="meta-format">Format</Label>
        <select
          id="meta-format"
          className={SELECT_CLASS}
          value={formatId}
          onChange={(changeEvent) => setFormatId(changeEvent.target.value)}
          aria-label="Format"
        >
          <option value="">Select a format…</option>
          {formats.map((format) => (
            <option key={format.id} value={format.id}>
              {format.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="meta-start">Start date</Label>
          <Input
            id="meta-start"
            type="date"
            value={startDate}
            onChange={(changeEvent) => setStartDate(changeEvent.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="meta-end">End date</Label>
          <Input
            id="meta-end"
            type="date"
            value={endDate}
            onChange={(changeEvent) => setEndDate(changeEvent.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="meta-description">Description</Label>
        <textarea
          id="meta-description"
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
          {mutation.error instanceof ApiError ? mutation.error.message : "Could not save the meta."}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {isEditing ? "Save changes" : "Create meta"}
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
