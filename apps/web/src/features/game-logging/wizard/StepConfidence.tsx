import type { ConfidenceFactors } from "@teambrewer/shared";

import { Button } from "@/components/ui/button";

import {
  type ConfidenceFactorField,
  DECK_MATURITY_FIELD,
  formatConfidenceWeight,
  PILOT_FAMILIARITY_FIELD,
  SERIOUSNESS_FIELD,
  SKILL_PARITY_FIELD,
} from "../game-display";
import { SegmentedControl } from "./SegmentedControl";

/** Step 3 — the confidence factors, the live weight, and the primary save action. */
export function StepConfidence({
  factors,
  setFactor,
  previewWeight,
  onLog,
  onAddNotes,
  isPending,
  isEditing,
}: {
  factors: ConfidenceFactors;
  setFactor: <Value extends string>(field: ConfidenceFactorField<Value>, value: Value) => void;
  previewWeight: number;
  onLog: () => void;
  onAddNotes: () => void;
  isPending: boolean;
  isEditing: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-md border border-border p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Confidence factors</h3>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            Counts as ~{formatConfidenceWeight(previewWeight)}
          </span>
        </div>
        <SegmentedControl
          label={SKILL_PARITY_FIELD.label}
          value={factors.skillParity}
          options={SKILL_PARITY_FIELD.options}
          onChange={(value) => setFactor(SKILL_PARITY_FIELD, value)}
        />
        <SegmentedControl
          label={SERIOUSNESS_FIELD.label}
          value={factors.seriousness}
          options={SERIOUSNESS_FIELD.options}
          onChange={(value) => setFactor(SERIOUSNESS_FIELD, value)}
        />
        <SegmentedControl
          label={DECK_MATURITY_FIELD.label}
          value={factors.deckMaturity}
          options={DECK_MATURITY_FIELD.options}
          onChange={(value) => setFactor(DECK_MATURITY_FIELD, value)}
        />
        <SegmentedControl
          label={PILOT_FAMILIARITY_FIELD.label}
          value={factors.pilotFamiliarity}
          options={PILOT_FAMILIARITY_FIELD.options}
          onChange={(value) => setFactor(PILOT_FAMILIARITY_FIELD, value)}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={onLog} disabled={isPending}>
          {isEditing ? "Save changes" : "Log game"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onAddNotes}>
          Add notes &amp; cards
        </Button>
      </div>
    </div>
  );
}
