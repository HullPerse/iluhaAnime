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
  hint,
  actionLabel,
  actionTitle,
  actionIcon,
  onAction,
  actionLoading,
  actionDisabled,
  busy,
}: {
  label: string;
  value?: ReactNode;
  hint?: string;
  actionLabel?: string;
  actionTitle?: string;
  actionIcon?: ReactNode;
  onAction?: () => void;
  actionLoading?: boolean;
  actionDisabled?: boolean;
  busy?: boolean;
}) {
  const handleAction = () => onAction?.();
  const text = typeof value === "string" ? value : undefined;
  const actionText = actionTitle ?? actionLabel;
  return (
    <div className="flex items-start gap-1 px-1">
      <span className="windows95-text text-hint w-20 shrink-0 truncate text-xs" title={label}>
        {label}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={
            busy === true
              ? "windows95-text text-hint min-w-0 truncate text-xs"
              : "windows95-text min-w-0 truncate text-xs"
          }
          title={text}
        >
          {value ?? ""}
        </span>
        {hint ? (
          <span className="windows95-text text-hint min-w-0 truncate text-xs" title={hint}>
            {hint}
          </span>
        ) : null}
      </span>
      {actionLabel && onAction ? (
        <Button
          size={actionIcon ? "icon" : "default"}
          className={actionIcon ? "size-5 shrink-0" : "h-5 shrink-0 px-1 text-xs"}
          title={actionText}
          aria-label={actionIcon ? actionText : actionLabel}
          onClick={handleAction}
          loading={actionLoading}
          disabled={actionDisabled}
        >
          {actionIcon ?? actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function SummaryButton({
  label,
  title,
  icon,
  onClick,
  busy,
}: {
  label: string;
  title?: string;
  icon?: ReactNode;
  onClick?: () => void;
  busy?: boolean;
}) {
  const handleClick = () => onClick?.();
  return (
    <Button
      className="h-5 w-full justify-start px-1 text-xs"
      title={title ?? label}
      aria-label={label}
      onClick={handleClick}
      loading={busy}
    >
      {icon}
      {label}
    </Button>
  );
}
