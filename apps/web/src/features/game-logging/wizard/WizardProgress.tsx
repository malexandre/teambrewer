/** The "Step N of 3" indicator with an optional Back control for the logging wizard. */
export function WizardProgress({
  step,
  label,
  onBack,
}: {
  step: number;
  label?: string;
  onBack?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label ?? `Step ${step} of 3`}
      </span>
      <div className="flex gap-2">
        {onBack ? (
          <button
            type="button"
            className="text-sm text-muted-foreground hover:underline"
            onClick={onBack}
          >
            Back
          </button>
        ) : null}
      </div>
    </div>
  );
}
