import ProgressBar from "@/components/shared/progress.component";

export function StatBar({
  label,
  value,
  max,
  text,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  text: string;
  tone: string;
}) {
  return (
    <span className="windows95-text text-hint flex items-center gap-1 text-xs">
      <span className="w-7 shrink-0">{label}</span>
      <ProgressBar value={value} max={max} className="h-3 w-16" barClassName={tone} />
      <span className="windows95-font text-text text-xs">{text}</span>
    </span>
  );
}
