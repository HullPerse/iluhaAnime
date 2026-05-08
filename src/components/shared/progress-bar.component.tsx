import { cn } from "@/lib/utils";

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
      className={cn(
        "h-[18px] border-2 border-solid border-t-muted border-l-muted border-b-white border-r-white bg-white relative overflow-hidden",
        className,
      )}
    >
      <div
        className="h-full bg-secondary transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default ProgressBar;
