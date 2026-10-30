import { cn } from "cn";
import { ChevronDown, ChevronRight } from "lucide-react";
import { memo } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { formatBytes } from "@/lib/core/bytes.utils";
import { QUEUE_ROW_HEIGHT } from "../queue.rows";
import type { QueueDragTarget, QueuePlace } from "@/types/torrent/torrentQueue";

interface QueueFolderRowProps {
  dir: string;
  first: number;
  count: number;
  remainingBytes: number;
  collapsed: boolean;
  virtualStart: number;
  drop: QueuePlace | null;
  dragging: boolean;
  onToggleCollapsed: (dir: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>, first: number) => void;
  onGripPointerDown: (event: PointerEvent<HTMLSpanElement>, target: QueueDragTarget) => void;
}

import DropLine from "./dropLine.queue";
import QueueGrip from "./grip.queue";

export const QueueFolderRow = memo(
  ({
    dir,
    first,
    count,
    remainingBytes,
    collapsed,
    virtualStart,
    drop,
    dragging,
    onToggleCollapsed,
    onKeyDown,
    onGripPointerDown,
  }: QueueFolderRowProps) => {
    const { t } = useI18n();
    const handleToggle = () => onToggleCollapsed(dir);
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => onKeyDown(event, first);
    const handleGripDown = (event: PointerEvent<HTMLSpanElement>) =>
      onGripPointerDown(event, { kind: "folder", first });

    return (
      <div
        role="treeitem"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-label={t("torrent.queue.folder.label", {
          name: dir || t("torrent.queue.folder.root"),
          count,
        })}
        data-testid="torrent-queue-folder"
        data-queue-folder={dir}
        onKeyDown={handleKeyDown}
        className={cn(
          "windows95-text bg-surface absolute top-0 left-0 flex w-full items-center gap-1 px-1 font-bold select-none",
          dragging && "opacity-40",
          "focus-visible:outline-text focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
        )}
        style={{ height: QUEUE_ROW_HEIGHT, transform: `translateY(${virtualStart}px)` }}
      >
        <DropLine place={drop} />
        <QueueGrip onPointerDown={handleGripDown} title={t("torrent.queue.drag")} />
        <Button
          size="icon"
          className="size-4"
          title={collapsed ? t("common.expand") : t("common.collapse")}
          aria-label={collapsed ? t("common.expand") : t("common.collapse")}
          onClick={handleToggle}
        >
          {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
        </Button>
        <span className="min-w-0 flex-1 truncate" title={dir}>
          {dir || t("torrent.queue.folder.root")}
        </span>
        <span className="text-hint shrink-0 tabular-nums">
          {t("torrent.queue.folder", { count, size: formatBytes(remainingBytes) })}
        </span>
      </div>
    );
  }
);
