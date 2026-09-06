import type { ReactNode } from "react";

export function DetailSection({
  icon,
  title,
  count,
  children,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="windows95-border bg-white">
      <header className="bg-secondary flex items-center gap-1 px-1 py-0.5 text-white">
        {icon}
        <span className="windows95-font text-xs font-bold">{title}</span>
        {typeof count === "number" && (
          <span className="windows95-font ml-auto text-xs text-white/70">{count}</span>
        )}
      </header>
      <div className="p-1.5">{children}</div>
    </section>
  );
}
