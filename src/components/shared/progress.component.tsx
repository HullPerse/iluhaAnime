import { cn } from "cn";

function ProgressBar({
  value,
  max,
  className,
  barClassName,
  ariaLabel,
}: {
  value: number;
  max: number;
  className?: string;
  barClassName?: string;
  ariaLabel?: string;
}) {
  const safeMax = Math.max(0, max);
  const safeValue = Math.max(0, Math.min(value, safeMax));
  const pct = safeMax > 0 ? (safeValue / safeMax) * 100 : 0;

  return (
    <div
      className={cn("windows95-border relative h-6 overflow-hidden bg-white", className)}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
    >
      <div
        className={cn("h-full transition-none", barClassName ?? "bg-secondary")}
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

export default ProgressBar;
