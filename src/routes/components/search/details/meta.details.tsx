import type { ReactNode } from "react";

export function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="windows95-border bg-surface min-w-0 px-1.5 py-1">
      <div className="windows95-text text-hint text-xs">{label}</div>
      <div className="windows95-text mt-0.5 text-xs wrap-break-word">{value}</div>
    </div>
  );
}
