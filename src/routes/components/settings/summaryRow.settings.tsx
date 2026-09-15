import type { ReactNode } from "react";

import { Button } from "@/components/ui/button.component";

export function SummarySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="windows95-text text-hint px-1 text-xs font-bold">{title}</span>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

export function SummaryRow({
  label,
  value,
  actionLabel,
  onAction,
  busy,
}: {
  label: string;
  value: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
}) {
  const handleAction = () => onAction?.();
  const text = typeof value === "string" ? value : undefined;
  return (
    <div className="flex flex-row items-center gap-1 px-1">
      <span className="windows95-text text-hint w-20 shrink-0 text-xs">{label}</span>
      <span
        className={
          busy === true
            ? "windows95-text text-hint min-w-0 flex-1 truncate text-xs"
            : "windows95-text min-w-0 flex-1 truncate text-xs"
        }
        title={text}
      >
        {value}
      </span>
      {actionLabel && onAction ? (
        <Button className="h-5 shrink-0 px-1 text-xs" onClick={handleAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
