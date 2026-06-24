import { cn } from "@/lib/index.utils";

function ProgressBar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div
      className={cn("h-6 windows95-border relative overflow-hidden", className)}
    >
      <div
        className="h-full bg-secondary transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default ProgressBar;
