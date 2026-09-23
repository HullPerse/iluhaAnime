import { cn } from "cn";
import { ChevronRight, Plus } from "lucide-react";

import { PUBLIC_STATUS_MAX_ITEMS } from "@/config/collection/statuses.config";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import type { CollectionStatusDef } from "@/types/collection";

export function publicHeaderProps({
  status,
  count,
  addLabel,
  onAddToStatus,
}: {
  status: CollectionStatusDef;
  count: number;
  addLabel: string;
  onAddToStatus?: (status: CollectionStatusDef) => void;
}): { maxCount?: number; onAdd?: () => void; addDisabled?: boolean; addLabel?: string } {
  if (status.kind !== "public") return {};
  return {
    maxCount: PUBLIC_STATUS_MAX_ITEMS,
    onAdd: onAddToStatus ? () => onAddToStatus(status) : undefined,
    addDisabled: count >= PUBLIC_STATUS_MAX_ITEMS,
    addLabel,
  };
}

export function GroupHeaderCollection({
  label,
  color,
  count,
  maxCount,
  collapsed,
  variant,
  toggleLabel,
  onToggle,
  onAdd,
  addDisabled,
  addLabel,
}: {
  label: string;
  color: string;
  count: number;
  maxCount?: number;
  collapsed: boolean;
  variant: "torrent" | "folder";
  toggleLabel: string;
  onToggle: () => void;
  onAdd?: () => void;
  addDisabled?: boolean;
  addLabel?: string;
}) {
  const isTorrent = variant === "torrent";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      title={toggleLabel}
      onClick={onToggle}
      onKeyDown={enterOrSpace(onToggle)}
      className={cn(
        "flex w-full cursor-pointer items-center gap-1 select-none",
        isTorrent
          ? "bg-secondary text-title-text px-1"
          : "windows95-active-border bg-primary hover:bg-surface px-0.5 py-0.5 text-left"
      )}
    >
      <ChevronRight
        className={cn("size-3 shrink-0 transition-transform", !collapsed && "rotate-90")}
        aria-hidden
      />
      <span
        className="windows95-border size-2.5 shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-bold",
          isTorrent ? "windows95-text py-0.5" : "windows95-text"
        )}
      >
        {label}
      </span>
      <span
        className={cn("ml-auto shrink-0 text-xs whitespace-nowrap", isTorrent ? "" : "text-hint")}
      >
        {maxCount != null ? `${count}/${maxCount}` : count}
      </span>
      {onAdd && (
        <button
          type="button"
          disabled={addDisabled}
          title={addLabel}
          aria-label={addLabel}
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className="windows95-active-border bg-primary text-text windows95-text flex size-4 shrink-0 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px disabled:cursor-default disabled:opacity-40"
        >
          <Plus className="size-3" aria-hidden />
        </button>
      )}
    </div>
  );
}
