import type { ReactNode } from "react";

export function StatePanel({
  icon,
  title,
  description,
  action,
  alert = false,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  alert?: boolean;
}) {
  return (
    <section
      className="windows95-border bg-primary flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 p-6"
      role={alert ? "alert" : "status"}
    >
      {icon}
      <span className="windows95-text text-sm font-bold">{title}</span>
      {description && (
        <span className="text-hint windows95-text max-h-40 max-w-xl overflow-y-auto text-center break-words whitespace-pre-wrap">
          {description}
        </span>
      )}
      {action}
    </section>
  );
}
