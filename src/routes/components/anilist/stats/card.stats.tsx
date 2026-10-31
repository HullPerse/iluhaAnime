import type { ReactNode } from "react";

/**
 * One card of the statistics Overview: a title line, an optional hint slot
 * (for example the "Updated" time) and the chart content.
 */
export function StatsCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="windows95-border bg-field flex flex-col gap-1 p-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="windows95-text text-xs font-bold">{title}</h3>
        {hint != null && <span className="text-hint windows95-font shrink-0 text-xs">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
