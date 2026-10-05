import { cn } from "cn";

/**
 * Cell cap for the `slots` render mode. Above this many units the cell count
 * stays at the cap and the filled count is scaled to the ratio, so a
 * 1000-episode show still reads as a segmented bar instead of a subpixel smudge.
 */
export const PROGRESS_SLOTS_CAP = 24;

function ProgressBar({
  value,
  max,
  className,
  barClassName,
  ariaLabel,
  indeterminate = false,
  slots = false,
  slotsCap = PROGRESS_SLOTS_CAP,
}: {
  value: number;
  max: number;
  className?: string;
  barClassName?: string;
  ariaLabel?: string;
  indeterminate?: boolean;
  /**
   * Render one cell per unit of `max` (e.g. one cell per episode) instead of the
   * block-masked percentage fill: filled cells use `barClassName`, empty ones sit
   * on `bg-surface`. `slotsCap` caps the rendered cell count; totals above the cap
   * scale the filled count to the cap. `max <= 0` falls back to the percentage bar.
   */
  slots?: boolean;
  slotsCap?: number;
}) {
  if (indeterminate) {
    return (
      <div
        className={cn("windows95-active-border bg-field relative h-6 overflow-hidden", className)}
        role="progressbar"
        aria-label={ariaLabel}
      >
        <div
          className={cn(
            "progress-blocks animate-indeterminate h-full w-[40%] transition-none",
            barClassName ?? "bg-secondary"
          )}
          aria-hidden="true"
        />
      </div>
    );
  }

  const safeMax = Math.max(0, max);
  const safeValue = Math.max(0, Math.min(value, safeMax));

  if (slots && safeMax > 0) {
    const count = Math.min(Math.floor(safeMax), Math.max(1, Math.floor(slotsCap)));
    const filled = Math.round((safeValue / safeMax) * count);
    return (
      <div
        className={cn("windows95-active-border bg-field flex h-6 gap-px overflow-hidden p-px", className)}
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className={cn("flex-1", i < filled ? (barClassName ?? "bg-secondary") : "bg-surface")}
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  const pct = safeMax > 0 ? (safeValue / safeMax) * 100 : 0;

  return (
    <div
      className={cn("windows95-active-border bg-field relative h-6 overflow-hidden", className)}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
    >
      <div
        className={cn("progress-blocks h-full transition-none", barClassName ?? "bg-secondary")}
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

export default ProgressBar;
