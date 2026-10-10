import type { ReactNode } from "react";

export function DetailSection({
  icon,
  title,
  count,
  children,
  className,
  bodyClassName,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`windows95-border bg-field${className ? ` ${className}` : ""}`}>
      <header className="bg-secondary text-title-text flex items-center gap-1 px-1 py-0.5">
        {icon}
        <span className="windows95-font text-xs font-bold">{title}</span>
        {typeof count === "number" && (
          <span className="windows95-font text-title-text/70 ml-auto text-xs">{count}</span>
        )}
      </header>
      <div className={bodyClassName ?? "p-1.5"}>{children}</div>
    </section>
  );
}
