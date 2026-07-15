import {
  type CreateMetaInput,
  type MetaChangeReason,
  type MetaDetail,
  type UpdateMetaInput,
} from "@teambrewer/shared";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormats } from "@/features/cards/use-formats";
import { HeroPicker } from "@/features/decks/HeroPicker";
import { ApiError } from "@/lib/api-client";

import { SELECT_CLASS, toDateInputValue } from "./meta-display";
import { useCreateMeta, useUpdateMeta } from "./use-meta-mutations";

/** The change-reason detail carried alongside a create/update, normalized to the chosen reason. */
type ChangeReasonFields = {
  changeReason: MetaChangeReason | null;
  changeReasonHeroId?: string | null;
  changeReasonImageUrl?: string | null;
};

/**
 * Create or edit a meta: a name, the format it covers, a start/end date window, an optional
 * prose description, and an optional **reason** (a ban-list update, heroes going Living Legend,
 * or a new product release) that drives the list card's imagery. The format is required; the
 * window ordering and the product-image URL are validated client-side before submit; the API
 * re-checks everything authoritatively.
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
  const [changeReason, setChangeReason] = useState<MetaChangeReason | "">(meta?.changeReason ?? "");
  const [changeReasonHeroId, setChangeReasonHeroId] = useState(meta?.changeReasonHeroId ?? "");
  const [changeReasonImageUrl, setChangeReasonImageUrl] = useState(
    meta?.changeReasonImageUrl ?? "",
  );
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
    const trimmedImageUrl = changeReasonImageUrl.trim();
    if (
      changeReason === "product_release" &&
      trimmedImageUrl.length > 0 &&
      !/^https?:\/\//i.test(trimmedImageUrl)
    ) {
      setValidationError("The marketing image URL must start with http:// or https://.");
      return;
    }

    // Send only the detail that matches the chosen reason; the API normalizes the rest away.
    const changeReasonValue: MetaChangeReason | null = changeReason === "" ? null : changeReason;
    const changeReasonFields: ChangeReasonFields = { changeReason: changeReasonValue };
    if (changeReasonValue === "living_legend") {
      changeReasonFields.changeReasonHeroId = changeReasonHeroId || null;
    }
    if (changeReasonValue === "product_release") {
      changeReasonFields.changeReasonImageUrl = trimmedImageUrl || null;
    }

    if (isEditing && meta) {
      const input: UpdateMetaInput = {
        name: name.trim(),
        formatId,
        startDate,
        endDate,
        description,
        ...changeReasonFields,
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
      ...changeReasonFields,
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

      <div className="flex flex-col gap-1">
        <Label htmlFor="meta-change-reason">Why a new meta? (optional)</Label>
        <select
          id="meta-change-reason"
          className={SELECT_CLASS}
          value={changeReason}
          onChange={(changeEvent) =>
            setChangeReason(changeEvent.target.value as MetaChangeReason | "")
          }
          aria-label="Why a new meta?"
        >
          <option value="">— No specific reason —</option>
          <option value="ban_list">Ban list update</option>
          <option value="living_legend">Heroes to Living Legend</option>
          <option value="product_release">New product release</option>
        </select>
      </div>

      {changeReason === "living_legend" ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="meta-change-reason-hero">Retiring hero</Label>
          <HeroPicker
            id="meta-change-reason-hero"
            teamId={teamId}
            formatId={formatId || undefined}
            value={changeReasonHeroId}
            onChange={setChangeReasonHeroId}
          />
        </div>
      ) : null}

      {changeReason === "product_release" ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="meta-change-reason-image">Marketing image URL</Label>
          <Input
            id="meta-change-reason-image"
            type="url"
            value={changeReasonImageUrl}
            onChange={(changeEvent) => setChangeReasonImageUrl(changeEvent.target.value)}
            placeholder="https://fabtcg.com/…"
          />
          <p className="text-xs text-muted-foreground">
            Paste the marketing image URL (e.g. from fabtcg.com). We only link to it, never copy it.
          </p>
        </div>
      ) : null}

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
