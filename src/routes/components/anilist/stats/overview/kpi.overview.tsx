import type { ReactNode } from "react";

export function Kpi({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="windows95-border bg-surface flex min-w-24 flex-1 flex-col gap-0.5 px-2 py-1">
      <span className="text-hint windows95-font text-xs">{label}</span>
      <span className="windows95-text text-sm font-bold tabular-nums">{children}</span>
    </div>
  );
}
