import type { ReactNode } from "react";

export default function LabSection({
  id,
  title,
  hint,
  actions,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      data-lab-section={id}
      className="windows95-border bg-primary flex min-w-0 flex-col gap-2 p-2"
    >
      <header className="windows95-active-border bg-secondary flex flex-wrap items-center gap-2 px-2 py-1">
        <h2 className="windows95-text text-title-text m-0 text-sm font-bold">{title}</h2>
        {hint !== undefined && <span className="windows95-text text-hint">{hint}</span>}
        {actions !== undefined && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
