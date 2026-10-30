import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { sameQueueTarget } from "@/lib/torrent/torrentQueueDrag.utils";
import type { QueueDragTarget, QueuePlace } from "@/types/torrent/torrentQueue";
import type { QueueListProps } from "@/types/torrent/torrentQueueDrag";

import {
  QUEUE_ROW_HEIGHT,
  QUEUE_VIEW_HEIGHT,
  QueueFileRow,
  QueueFolderRow,
} from "@/routes/components/torrent/rows/queue.rows";

export function QueueList({
  display,
  byIndex,
  rowBlocks,
  positions,
  included,
  current,
  drag,
  hint,
  listRef,
  treeRef,
  scrollRef,
  onToggleIncluded,
  onFileKeyDown,
  onFolderKeyDown,
  onMoveStep,
  onToggleCollapsed,
  onGripPointerDown,
}: QueueListProps) {
  const { t } = useI18n();
  const virtualizer = useVirtualizer({
    count: display.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => QUEUE_ROW_HEIGHT,
    overscan: 8,
    initialRect: { width: 0, height: QUEUE_VIEW_HEIGHT },
  });
  useEffect(() => {
    scrollRef.current = virtualizer;
    return () => {
      scrollRef.current = null;
    };
  }, [scrollRef, virtualizer]);
  const virtualItems = virtualizer.getVirtualItems();
  const dropOf = (target: QueueDragTarget): QueuePlace | null => {
    if (!hint || !sameQueueTarget(hint.target, target)) return null;
    return hint.place;
  };

  return (
    <div
      ref={listRef}
      data-testid="torrent-queue-list"
      className="windows95-border bg-field max-h-[50vh] overflow-y-auto p-0.5"
      style={{ minHeight: display.length > 0 ? QUEUE_VIEW_HEIGHT : undefined }}
    >
      {display.length === 0 ? (
        <span className="windows95-text text-hint block p-1" data-testid="torrent-queue-empty">
          {t("torrent.queue.empty.done")}
        </span>
      ) : (
        <div
          ref={treeRef}
          className="relative"
          role="tree"
          aria-label={t("torrent.queue.title")}
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualItems.map((virtualRow) => {
            const item = display[virtualRow.index];
            if (!item) return null;
            if (item.kind === "folder") {
              return (
                <QueueFolderRow
                  key={`folder:${item.first}`}
                  dir={item.dir}
                  first={item.first}
                  count={item.count}
                  remainingBytes={item.remainingBytes}
                  collapsed={item.collapsed}
                  virtualStart={virtualRow.start}
                  drop={dropOf({ kind: "folder", first: item.first })}
                  dragging={sameQueueTarget(drag, { kind: "folder", first: item.first })}
                  onToggleCollapsed={onToggleCollapsed}
                  onKeyDown={onFolderKeyDown}
                  onGripPointerDown={onGripPointerDown}
                />
              );
            }
            const file = byIndex.get(item.index);
            if (!file) return null;
            const entry = rowBlocks.get(item.index);
            return (
              <QueueFileRow
                key={`file:${item.index}`}
                file={file}
                virtualStart={virtualRow.start}
                position={positions.get(item.index)}
                included={included.has(item.index)}
                current={item.index === current}
                drop={dropOf({ kind: "file", index: item.index })}
                dragging={sameQueueTarget(drag, { kind: "file", index: item.index })}
                canMoveUp={Boolean(entry && entry.at > entry.block.start)}
                canMoveDown={Boolean(entry && entry.at < entry.block.end)}
                onToggleIncluded={onToggleIncluded}
                onKeyDown={onFileKeyDown}
                onMoveStep={onMoveStep}
                onGripPointerDown={onGripPointerDown}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
