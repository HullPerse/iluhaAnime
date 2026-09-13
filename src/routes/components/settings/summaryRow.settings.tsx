import type { ReactNode } from "react";

import { Button } from "@/components/ui/button.component";

export function SummaryRow({
  label,
  value,
  actionLabel,
  onAction,
}: {
  label: string;
  value: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const handleAction = () => onAction?.();
  return (
    <div className="flex flex-row items-center gap-1 px-1">
      <span className="windows95-text text-hint w-24 shrink-0 text-xs">{label}</span>
      <span
        className="windows95-text min-w-0 flex-1 truncate text-xs"
        title={typeof value === "string" ? value : undefined}
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
