export function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-hint text-xs">{label}</span>
      <span className="text-text text-xs tabular-nums">{value}</span>
    </div>
  );
}
