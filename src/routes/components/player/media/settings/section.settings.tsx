import type { ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-muted flex flex-col gap-1 border-b-2 pb-2">
      <span className="windows95-text text-xs font-bold">{title}</span>
      {children}
    </section>
  );
}
