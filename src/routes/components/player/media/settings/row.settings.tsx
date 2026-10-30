import type { ReactNode } from "react";

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-row items-center gap-1">
      <span className="windows95-font w-28 shrink-0 text-xs">{label}</span>
      {children}
    </div>
  );
}
