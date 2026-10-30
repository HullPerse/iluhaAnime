import type { ReactNode } from "react";

export function SummarySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="windows95-text text-hint px-1 text-xs font-bold">{title}</span>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
