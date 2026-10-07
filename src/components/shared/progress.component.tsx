import { cn } from "cn";

import { useCell } from "@/lib/state/signal.hook";
import { settingsAtoms } from "@/store/settings.store";

const PROGRESS_SLOTS_CAP = 12;

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
  slots?: boolean;
  slotsCap?: number;
}) {
  const progressStyle = useCell(settingsAtoms.progressStyle);
  const solid = progressStyle === "solid";
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
            barClassName ?? "bg-progress-main"
          )}
          aria-hidden="true"
        />
      </div>
    );
  }

  const safeMax = Math.max(0, max);
  const safeValue = Math.max(0, Math.min(value, safeMax));

  if (slots && !solid && safeMax > 0) {
    const count = Math.max(1, Math.floor(slotsCap));
    const filled = safeValue >= safeMax ? count : Math.floor((safeValue / safeMax) * count);
    return (
      <div
        className={cn(
          "windows95-active-border bg-field flex h-6 gap-px overflow-hidden p-px",
          className
        )}
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className={cn(
              "flex-1",
              i < filled ? (barClassName ?? "bg-progress-main") : "bg-surface"
            )}
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
        className={cn(
          !solid && "progress-blocks",
          "h-full transition-none",
          barClassName ?? "bg-progress-main"
        )}
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

export default ProgressBar;
