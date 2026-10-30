import { cn } from "cn";
import { ChevronDown, Play } from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";
import { memo } from "react";

import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { QueueDragTarget, QueuePlace } from "@/types/torrent/torrentQueue";
import { formatBytes } from "@/lib/core/bytes.utils";
import type { TorrentFileInfo } from "@/types/torrent/torrent";

import DropLine from "./queue/dropLine.queue";
import QueueGrip from "./queue/grip.queue";

export const QUEUE_ROW_HEIGHT = 20;
export const QUEUE_VIEW_HEIGHT = 224;

interface QueueFileRowProps {
  file: TorrentFileInfo;
  virtualStart: number;
  position: number | undefined;
  included: boolean;
  current: boolean;
  drop: QueuePlace | null;
  dragging: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggleIncluded: (index: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>, index: number) => void;
  onMoveStep: (index: number, delta: -1 | 1) => void;
  onGripPointerDown: (event: PointerEvent<HTMLSpanElement>, target: QueueDragTarget) => void;
}

export const QueueFileRow = memo(
  ({
    file,
    virtualStart,
    position,
    included,
    current,
    drop,
    dragging,
    canMoveUp,
    canMoveDown,
    onToggleIncluded,
    onKeyDown,
    onMoveStep,
    onGripPointerDown,
  }: QueueFileRowProps) => {
    const { t } = useI18n();
    const percent =
      file.size > 0 ? Math.min(100, Math.round((file.progress_bytes / file.size) * 100)) : 0;
    const remaining = Math.max(0, file.size - file.progress_bytes);
    const handleToggle = () => onToggleIncluded(file.index);
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => onKeyDown(event, file.index);
    const handleUp = () => onMoveStep(file.index, -1);
    const handleDown = () => onMoveStep(file.index, 1);
    const handleGripDown = (event: PointerEvent<HTMLSpanElement>) =>
      onGripPointerDown(event, { kind: "file", index: file.index });

    return (
      <div
        role="treeitem"
        tabIndex={0}
        aria-selected={included}
        aria-label={t("torrent.queue.row", {
          name: file.name,
          position: position ?? "-",
        })}
        data-testid="torrent-queue-row"
        data-queue-index={file.index}
        onKeyDown={handleKeyDown}
        className={cn(
          "windows95-text absolute top-0 left-0 flex w-full items-center gap-1 px-1 select-none",
          included ? "hover:bg-surface" : "text-hint",
          dragging && "opacity-40",
          "focus-visible:outline-text focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
        )}
        style={{ height: QUEUE_ROW_HEIGHT, transform: `translateY(${virtualStart}px)` }}
      >
        <DropLine place={drop} />
        <QueueGrip onPointerDown={handleGripDown} title={t("torrent.queue.drag")} />
        <Checkbox
          checked={included}
          onChange={handleToggle}
          disabled={file.completed}
          className="size-3"
          aria-label={t("torrent.queue.select", { name: file.name })}
        />
        <span className="text-hint w-5 shrink-0 text-right tabular-nums">{position ?? "-"}</span>
        <span
          className={cn("min-w-0 flex-1 truncate", file.completed && "line-through")}
          title={file.name}
        >
          {file.name}
        </span>
        {current && (
          <span
            className="text-secondary shrink-0"
            title={t("torrent.queue.current")}
            data-testid="torrent-queue-current"
          >
            <Play className="size-3" />
          </span>
        )}
        {file.completed ? (
          <span className="text-hint shrink-0">{t("torrent.queue.done")}</span>
        ) : (
          <>
            <span className="text-hint w-8 shrink-0 text-right tabular-nums">{percent}%</span>
            {included && (
              <span className="text-hint w-[4.5rem] shrink-0 text-right whitespace-nowrap tabular-nums">
                {formatBytes(remaining)}
              </span>
            )}
          </>
        )}
        <span className="text-hint w-[4.5rem] shrink-0 text-right whitespace-nowrap tabular-nums">
          {formatBytes(file.size)}
        </span>
        <Button
          size="icon"
          className="size-4"
          title={t("torrent.queue.up")}
          aria-label={t("torrent.queue.up")}
          disabled={!canMoveUp}
          onClick={handleUp}
        >
          <ChevronDown className="size-3 rotate-180" />
        </Button>
        <Button
          size="icon"
          className="size-4"
          title={t("torrent.queue.down")}
          aria-label={t("torrent.queue.down")}
          disabled={!canMoveDown}
          onClick={handleDown}
        >
          <ChevronDown className="size-3" />
        </Button>
      </div>
    );
  }
);
