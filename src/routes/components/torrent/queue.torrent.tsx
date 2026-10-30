import { useVirtualizer } from "@tanstack/react-virtual";
import { GripVertical } from "lucide-react";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/signal.hook";
import {
  buildQueueRows,
  queueApplyDrop,
  queueBlockOf,
  queueBlocks,
  queueDir,
  queueDisplay,
  queueFileName,
  queueIncludedOrder,
  queueMoveBlockEdge,
  queueMoveBlockStep,
  queueMoveFileEdge,
  queueMoveFileStep,
  queuePayload,
  queuePointHit,
  queuePositions,
  queueRemainingBytes,
} from "@/lib/torrentQueue.utils";
import type {
  QueueBlock,
  QueueDisplayItem,
  QueueDragTarget,
  QueueEdge,
  QueuePlace,
} from "@/types/torrentQueue";
import { formatBytes } from "@/lib/bytes.utils";
import { ignore } from "@/lib/promise.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { TorrentFileInfo, TorrentQueueApply } from "@/types/torrent";

import {
  QUEUE_ROW_HEIGHT,
  QUEUE_VIEW_HEIGHT,
  QueueFileRow,
  QueueFolderRow,
} from "./rows/queue.rows";

interface QueueHint {
  target: QueueDragTarget;
  place: QueuePlace;
}

interface QueueSnapshot {
  rows: number[];
  included: Set<number>;
}

interface QueueGhost {
  x: number;
  y: number;
  width: number;
}

interface QueueScroll {
  scrollToIndex: (index: number, options?: { align?: "auto" | "start" | "center" | "end" }) => void;
}

interface QueueDragState {
  target: QueueDragTarget;
  pointerId: number;
  clientY: number;
  grabY: number;
  raf: number;
  stop: () => void;
}

const QUEUE_SCROLL_EDGE = 24;
const QUEUE_SCROLL_STEP = 12;

function sameQueueTarget(left: QueueDragTarget | null, right: QueueDragTarget): boolean {
  if (!left || left.kind !== right.kind) return false;
  if (left.kind === "file" && right.kind === "file") return left.index === right.index;
  if (left.kind === "folder" && right.kind === "folder") return left.first === right.first;
  return false;
}

function canQueueDrop(
  rows: number[],
  byIndex: Map<number, TorrentFileInfo>,
  active: QueueDragTarget,
  over: QueueDragTarget
): boolean {
  if (active.kind === "file" && over.kind === "folder") return false;
  const from = queueBlockOf(rows, byIndex, active);
  const to = queueBlockOf(rows, byIndex, over);
  if (!from || !to) return false;
  return active.kind === "folder" ? from.start !== to.start : from.start === to.start;
}

function QueueList({
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
}: {
  display: QueueDisplayItem[];
  byIndex: Map<number, TorrentFileInfo>;
  rowBlocks: Map<number, { block: QueueBlock; at: number }>;
  positions: Map<number, number>;
  included: Set<number>;
  current: number | null;
  drag: QueueDragTarget | null;
  hint: QueueHint | null;
  listRef: RefObject<HTMLDivElement | null>;
  treeRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<QueueScroll | null>;
  onToggleIncluded: (index: number) => void;
  onFileKeyDown: (event: KeyboardEvent<HTMLDivElement>, index: number) => void;
  onFolderKeyDown: (event: KeyboardEvent<HTMLDivElement>, first: number) => void;
  onMoveStep: (index: number, delta: -1 | 1) => void;
  onToggleCollapsed: (dir: string) => void;
  onGripPointerDown: (event: PointerEvent<HTMLSpanElement>, target: QueueDragTarget) => void;
}) {
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

export function TorrentQueueModal({
  files,
  order,
  current,
  sequential,
  onApply,
  onClose,
}: {
  files: TorrentFileInfo[];
  order: number[];
  current: number | null;
  sequential: boolean;
  onApply: (payload: TorrentQueueApply) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const fileOrder = useCell(settingsAtoms.fileOrder);
  const listRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<QueueDragState | null>(null);
  const scrollRef = useRef<QueueScroll | null>(null);
  const [queue, setQueue] = useState<QueueSnapshot & { baseline: QueueSnapshot }>(() => {
    const snapshot: QueueSnapshot = {
      rows: buildQueueRows(files, order, fileOrder),
      included: new Set(
        files.filter((file) => file.selected && !file.completed).map((file) => file.index)
      ),
    };
    return { ...snapshot, baseline: snapshot };
  });
  const rows = queue.rows;
  const included = queue.included;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<QueueDragTarget | null>(null);
  const [ghost, setGhost] = useState<QueueGhost | null>(null);
  const [hint, setHint] = useState<QueueHint | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const byIndex = useMemo(() => new Map(files.map((file) => [file.index, file])), [files]);
  const activeRows = useMemo(() => rows.filter((index) => byIndex.has(index)), [rows, byIndex]);
  const blocks = useMemo(() => queueBlocks(activeRows, byIndex), [activeRows, byIndex]);
  const rowBlocks = useMemo(() => {
    const map = new Map<number, { block: QueueBlock; at: number }>();
    for (const block of blocks) {
      for (let at = block.start; at <= block.end; at++) {
        const index = activeRows[at];
        if (index !== undefined) map.set(index, { block, at });
      }
    }
    return map;
  }, [blocks, activeRows]);
  const positions = useMemo(
    () => queuePositions(activeRows, included, byIndex),
    [activeRows, included, byIndex]
  );
  const display = useMemo(
    () => queueDisplay(activeRows, blocks, byIndex, positions, collapsed),
    [activeRows, blocks, byIndex, positions, collapsed]
  );
  const remainingBytes = useMemo(
    () => queueRemainingBytes(positions, byIndex),
    [positions, byIndex]
  );
  const dirty = useMemo(() => {
    const now = queueIncludedOrder(activeRows, included);
    const then = queueIncludedOrder(queue.baseline.rows, queue.baseline.included);
    return now.length !== then.length || now.some((index, at) => index !== then[at]);
  }, [activeRows, included, queue.baseline]);

  const announceFile = (next: number[], index: number) => {
    const file = byIndex.get(index);
    if (!file) return;
    const nextPositions = queuePositions(next, included, byIndex);
    setAnnouncement(
      t("torrent.queue.moved", {
        name: queueFileName(file.name),
        position: nextPositions.get(index) ?? "-",
        total: nextPositions.size,
      })
    );
  };

  const announceFolder = (next: number[], dir: string) => {
    const nextBlocks = queueBlocks(next, byIndex);
    const nextPositions = queuePositions(next, included, byIndex);
    const block = nextBlocks.find((entry) => entry.dir === dir);
    setAnnouncement(
      t("torrent.queue.moved.folder", {
        name: dir || t("torrent.queue.folder.root"),
        position: (block && nextPositions.get(block.first)) ?? "-",
        total: nextPositions.size,
      })
    );
  };

  const applyRows = (next: number[], target: QueueDragTarget) => {
    if (next === activeRows) return;
    setQueue((prev) => ({ ...prev, rows: next }));
    if (target.kind === "file") {
      announceFile(next, target.index);
    } else {
      const file = byIndex.get(target.first);
      announceFolder(next, file ? queueDir(file.name) : "");
    }
    const nextDisplay = queueDisplay(
      next,
      queueBlocks(next, byIndex),
      byIndex,
      queuePositions(next, included, byIndex),
      collapsed
    );
    const at = nextDisplay.findIndex((item) =>
      target.kind === "file"
        ? item.kind === "file" && item.index === target.index
        : item.kind === "folder" && item.first === target.first
    );
    if (at !== -1) scrollRef.current?.scrollToIndex(at, { align: "auto" });
  };

  const moveFileStep = (index: number, delta: -1 | 1) => {
    applyRows(queueMoveFileStep(activeRows, byIndex, index, delta), { kind: "file", index });
  };

  const moveFileEdge = (index: number, edge: QueueEdge) => {
    applyRows(queueMoveFileEdge(activeRows, byIndex, index, edge), { kind: "file", index });
  };

  const moveBlockStep = (first: number, delta: -1 | 1) => {
    applyRows(queueMoveBlockStep(activeRows, byIndex, first, delta), { kind: "folder", first });
  };

  const moveBlockEdge = (first: number, edge: QueueEdge) => {
    applyRows(queueMoveBlockEdge(activeRows, byIndex, first, edge), { kind: "folder", first });
  };

  const save = async () => {
    if (busy) return;
    const payload = queuePayload(
      activeRows,
      included,
      byIndex,
      queue.baseline.included,
      !sequential
    );
    if (payload.order.length === 0) return;
    setBusy(true);
    const applied = await onApply(payload);
    setBusy(false);
    if (applied) {
      onClose();
      return;
    }
    setConfirm(false);
  };

  const requestClose = () => {
    if (busy) return false;
    if (!dirty) return true;
    setConfirm(true);
    return false;
  };

  const handleFileKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" && !event.altKey) {
      event.preventDefault();
      if (!busy) ignore(save());
      return;
    }
    if (!event.altKey) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFileStep(index, -1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFileStep(index, 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFileEdge(index, "start");
    } else if (event.key === "End") {
      event.preventDefault();
      moveFileEdge(index, "end");
    }
  };

  const handleFolderKeyDown = (event: KeyboardEvent<HTMLDivElement>, first: number) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const file = byIndex.get(first);
      if (file) toggleCollapsed(queueDir(file.name));
      return;
    }
    if (!event.altKey) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveBlockStep(first, -1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveBlockStep(first, 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveBlockEdge(first, "start");
    } else if (event.key === "End") {
      event.preventDefault();
      moveBlockEdge(first, "end");
    }
  };

  const toggleIncluded = (index: number) => {
    if (byIndex.get(index)?.completed) return;
    setQueue((prev) => {
      const next = new Set(prev.included);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...prev, included: next };
    });
  };

  const toggleCollapsed = (dir: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  const reset = () => {
    setQueue((prev) => ({ ...prev, rows: buildQueueRows(files, [], fileOrder) }));
    setAnnouncement("");
  };

  useEffect(() => () => dragRef.current?.stop(), []);

  const beginDrag = (event: PointerEvent<HTMLSpanElement>, target: QueueDragTarget) => {
    if (event.button !== 0 || dragRef.current) return;
    const list = listRef.current;
    if (!list) return;
    event.preventDefault();
    event.stopPropagation();
    const listRect = list.getBoundingClientRect();
    const row = event.currentTarget.closest("[data-queue-index], [data-queue-folder]");
    const rowRect = row instanceof HTMLElement ? row.getBoundingClientRect() : null;
    const grabY = rowRect ? event.clientY - rowRect.top : QUEUE_ROW_HEIGHT / 2;
    const state: QueueDragState = {
      target,
      pointerId: event.pointerId,
      clientY: event.clientY,
      grabY,
      raf: 0,
      stop: () => undefined,
    };
    const pointerHit = (clientY: number): QueueHint | null => {
      const tree = treeRef.current;
      if (!tree) return null;
      const rect = list.getBoundingClientRect();
      if (clientY < rect.top || clientY > rect.bottom) return null;
      const hit = queuePointHit(
        display,
        clientY - tree.getBoundingClientRect().top,
        QUEUE_ROW_HEIGHT
      );
      if (!hit || !canQueueDrop(activeRows, byIndex, target, hit.target)) return null;
      return hit;
    };
    const update = () => {
      setGhost((prev) => (prev ? { ...prev, y: state.clientY - grabY } : prev));
      const next = pointerHit(state.clientY);
      setHint((prev) => {
        if (!prev || !next) return next;
        if (sameQueueTarget(prev.target, next.target) && prev.place === next.place) return prev;
        return next;
      });
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", stop);
      cancelAnimationFrame(state.raf);
      state.stop = () => undefined;
      if (dragRef.current === state) dragRef.current = null;
      setDrag(null);
      setGhost(null);
      setHint(null);
    };
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== state.pointerId) return;
      state.clientY = moveEvent.clientY;
      update();
    };
    const onUp = (upEvent: globalThis.PointerEvent) => {
      if (upEvent.pointerId !== state.pointerId) return;
      state.clientY = upEvent.clientY;
      const hit = pointerHit(state.clientY);
      stop();
      if (hit)
        applyRows(queueApplyDrop(activeRows, byIndex, target, hit.target, hit.place), target);
    };
    const onKey = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      stop();
    };
    const tick = () => {
      const rect = list.getBoundingClientRect();
      let delta = 0;
      if (state.clientY < rect.top + QUEUE_SCROLL_EDGE) delta = -QUEUE_SCROLL_STEP;
      else if (state.clientY > rect.bottom - QUEUE_SCROLL_EDGE) delta = QUEUE_SCROLL_STEP;
      if (delta !== 0) {
        list.scrollTop += delta;
        update();
      }
      state.raf = requestAnimationFrame(tick);
    };
    state.stop = stop;
    dragRef.current = state;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", stop);
    state.raf = requestAnimationFrame(tick);
    setDrag(target);
    setGhost({ x: listRect.left, y: event.clientY - grabY, width: listRect.width });
    setHint(null);
  };

  const handleReset = reset;
  const handleCancel = onClose;
  const handleSave = () => ignore(save());
  const handleKeep = onClose;
  const handleStay = () => setConfirm(false);
  const handleToggleIncluded = toggleIncluded;
  const handleToggleCollapsed = toggleCollapsed;
  const handleMoveFileStep = moveFileStep;

  const dragLabel = drag
    ? drag.kind === "file"
      ? (byIndex.get(drag.index)?.name ?? "")
      : queueDir(byIndex.get(drag.first)?.name ?? "")
    : "";

  return (
    <Modal
      header={t("torrent.queue.title")}
      onClose={onClose}
      canClose={requestClose}
      className="w-2xl"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="windows95-text text-hint flex flex-wrap items-center gap-1">
          <span>
            {positions.size > 0
              ? t("torrent.queue.summary", {
                  count: positions.size,
                  size: formatBytes(remainingBytes),
                })
              : t("torrent.queue.summary.empty")}
          </span>
        </div>
        <QueueList
          display={display}
          byIndex={byIndex}
          rowBlocks={rowBlocks}
          positions={positions}
          included={included}
          current={current}
          drag={drag}
          hint={hint}
          listRef={listRef}
          treeRef={treeRef}
          scrollRef={scrollRef}
          onToggleIncluded={handleToggleIncluded}
          onFileKeyDown={handleFileKeyDown}
          onFolderKeyDown={handleFolderKeyDown}
          onMoveStep={handleMoveFileStep}
          onToggleCollapsed={handleToggleCollapsed}
          onGripPointerDown={beginDrag}
        />
        {confirm && (
          <div
            className="windows95-active-border bg-primary flex flex-col gap-1 p-1"
            data-testid="torrent-queue-confirm"
          >
            <span className="windows95-text">{t("torrent.queue.confirm")}</span>
            <div className="flex flex-wrap justify-end gap-1">
              <Button variant="secondary" onClick={handleStay}>
                {t("common.cancel")}
              </Button>
              <Button variant="secondary" onClick={handleKeep}>
                {t("torrent.queue.discard")}
              </Button>
              <Button onClick={handleSave} loading={busy}>
                {t("torrent.queue.save")}
              </Button>
            </div>
          </div>
        )}
        <div className="bg-primary sticky bottom-0 flex flex-wrap items-center justify-between gap-1 pt-1">
          <Button variant="secondary" onClick={handleReset} disabled={busy}>
            {t("torrent.queue.reset")}
          </Button>
          <div className="flex gap-1">
            <Button variant="secondary" onClick={handleCancel} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} loading={busy} disabled={positions.size === 0}>
              {sequential ? t("torrent.queue.save") : t("torrent.queue.save.enable")}
            </Button>
          </div>
        </div>
        <span aria-live="polite" className="sr-only">
          {announcement}
        </span>
        {drag && ghost
          ? createPortal(
              <div
                className="windows95-active-border bg-primary windows95-text pointer-events-none fixed z-9999 flex h-5 max-w-sm items-center gap-1 px-1"
                style={{
                  left: ghost.x,
                  top: ghost.y,
                  width: ghost.width > 0 ? ghost.width : undefined,
                }}
              >
                <GripVertical className="size-3 shrink-0" />
                <span className="truncate">{dragLabel}</span>
              </div>,
              document.body
            )
          : null}
      </div>
    </Modal>
  );
}
