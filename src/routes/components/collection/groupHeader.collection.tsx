import { cn } from "cn";
import { ChevronRight } from "lucide-react";

import { enterOrSpace } from "@/lib/utils/keyboard.utils";

export function GroupHeaderCollection({
  label,
  color,
  count,
  collapsed,
  variant,
  toggleLabel,
  onToggle,
}: {
  label: string;
  color: string;
  count: number;
  collapsed: boolean;
  variant: "torrent" | "folder";
  toggleLabel: string;
  onToggle: () => void;
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
          ? "bg-secondary px-1 text-white"
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
        {count}
      </span>
    </div>
  );
}
