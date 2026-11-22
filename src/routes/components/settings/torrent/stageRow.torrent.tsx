import type { ReactNode } from "react";

export function StageRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-0.5 text-xs">
      <span className="windows95-text text-hint">{label}</span>
      <div className="windows95-text min-w-0 wrap-break-word">{children}</div>
    </div>
  );
}
