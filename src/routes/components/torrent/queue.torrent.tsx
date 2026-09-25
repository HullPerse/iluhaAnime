import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { useMemo, useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { groupFilesByDirectory } from "@/lib/torrent/tree.utils";
import { moveItem } from "@/lib/utils/array.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { TorrentFileInfo } from "@/types/torrent";

function QueueRow({
  file,
  position,
  current,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  file: TorrentFileInfo;
  position: number;
  current: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: -1 | 1) => void;
}) {
  const { t } = useI18n();
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: file.index });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: file.index });
  const percent = file.size > 0 ? Math.min(100, (file.progress_bytes / file.size) * 100) : 0;

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      data-testid="torrent-queue-row"
      className={`windows95-text bg-primary flex min-w-0 items-center gap-1 px-0.5 py-0.5 ${
        isOver ? "windows95-border" : ""
      }`}
      style={{
        transform: transform
          ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
          : undefined,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.8 : undefined,
      }}
    >
      <span
        ref={setActivatorNodeRef}
        data-testid="torrent-queue-handle"
        className="text-hint shrink-0 cursor-grab"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="size-3" />
      </span>
      <span className="text-hint w-5 shrink-0 text-right tabular-nums">{position + 1}.</span>
      <span className="min-w-0 flex-1 truncate" title={file.name}>
        {file.name}
      </span>
      {current && (
        <span
          className="text-secondary shrink-0"
          title={t("torrent.queue.current")}
          data-testid="torrent-queue-current"
        >
          {t("torrent.queue.current")}
        </span>
      )}
      <span className="bg-surface windows95-border h-3 w-10 shrink-0">
        <span
          className="bg-secondary block h-full transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="text-hint shrink-0 whitespace-nowrap">{formatBytes(file.size)}</span>
      <Button
        size="icon"
        className="size-4"
        title={t("torrent.queue.up")}
        aria-label={t("torrent.queue.up")}
        disabled={!canMoveUp}
        onClick={() => onMove(-1)}
      >
        <ChevronUp className="size-3" />
      </Button>
      <Button
        size="icon"
        className="size-4"
        title={t("torrent.queue.down")}
        aria-label={t("torrent.queue.down")}
        disabled={!canMoveDown}
        onClick={() => onMove(1)}
      >
        <ChevronDown className="size-3" />
      </Button>
    </div>
  );
}

export function TorrentQueueModal({
  files,
  order,
  current,
  onSave,
  onClose,
}: {
  files: TorrentFileInfo[];
  order: number[];
  current: number | null;
  onSave: (indices: number[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const fileOrder = useSettingsStore((s) => s.fileOrder);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const queued = useMemo(() => files.filter((file) => file.selected && !file.completed), [files]);
  const [arranged, setArranged] = useState<number[]>(() => {
    const inQueue = new Set(order);
    const rest = groupFilesByDirectory(queued, fileOrder)
      .flatMap((group) => group.files.map((file) => file.index))
      .filter((index) => !inQueue.has(index));
    return [...order.filter((index) => queued.some((file) => file.index === index)), ...rest];
  });

  const rows = useMemo(() => {
    const byIndex = new Map(queued.map((file) => [file.index, file]));
    const known = arranged.filter((index) => byIndex.has(index));
    const rest = [...byIndex.keys()].filter((index) => !known.includes(index));
    return [...known, ...rest];
  }, [arranged, queued]);

  const move = (from: number, to: number) => {
    setArranged(moveItem(rows, from, to));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const from = rows.indexOf(Number(active.id));
    const to = rows.indexOf(Number(over.id));
    if (from === -1 || to === -1) return;
    move(from, to);
  };

  const reset = () => {
    setArranged(
      groupFilesByDirectory(queued, fileOrder).flatMap((group) =>
        group.files.map((file) => file.index)
      )
    );
  };

  return (
    <Modal header={t("torrent.queue.title")} onClose={onClose} className="w-xl">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="windows95-text text-hint">{t("torrent.queue.hint")}</span>
        {rows.length === 0 ? (
          <span className="windows95-text text-hint py-1" data-testid="torrent-queue-empty">
            {t("torrent.queue.empty")}
          </span>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="windows95-border bg-field flex min-w-0 flex-col p-0.5">
              {rows.map((index, position) => {
                const file = queued.find((entry) => entry.index === index);
                if (!file) return null;
                return (
                  <QueueRow
                    key={index}
                    file={file}
                    position={position}
                    current={index === current}
                    canMoveUp={position > 0}
                    canMoveDown={position < rows.length - 1}
                    onMove={(delta) => move(position, position + delta)}
                  />
                );
              })}
            </div>
          </DndContext>
        )}
        <div className="flex flex-row justify-end gap-1">
          <Button variant="secondary" onClick={reset} disabled={rows.length < 2}>
            {t("torrent.queue.reset")}
          </Button>
          <Button
            onClick={() => {
              onSave(rows);
              onClose();
            }}
            disabled={rows.length < 2}
          >
            {t("torrent.queue.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
