import { groupFilesByDirectory } from "@/lib/torrentTree.utils";
import type { FileOrder, TorrentFileInfo, TorrentQueueApply } from "@/types/torrent";

export type QueuePlace = "before" | "after";
export type QueueEdge = "start" | "end";

export interface QueueBlock {
  dir: string;
  first: number;
  start: number;
  end: number;
}

export type QueueDragTarget = { kind: "file"; index: number } | { kind: "folder"; first: number };

export type QueueDisplayItem =
  | {
      kind: "folder";
      dir: string;
      first: number;
      count: number;
      remainingBytes: number;
      collapsed: boolean;
    }
  | { kind: "file"; index: number };

export function queueDir(name: string): string {
  const at = name.search(/[/\\]/);
  return at === -1 ? "" : name.slice(0, at);
}

export function queueFileName(name: string): string {
  const at = name.search(/[/\\]/);
  return at === -1 ? name : name.slice(at + 1);
}

export function buildQueueRows(
  files: TorrentFileInfo[],
  order: number[],
  fileOrder: FileOrder
): number[] {
  const remaining = files.filter((file) => !file.completed);
  const known = new Set(remaining.map((file) => file.index));
  const seen = new Set<number>();
  const queued: number[] = [];
  for (const index of order) {
    if (!known.has(index) || seen.has(index)) continue;
    seen.add(index);
    queued.push(index);
  }
  const rest = groupFilesByDirectory(
    remaining.filter((file) => !seen.has(file.index)),
    fileOrder
  ).flatMap((group) => group.files.map((file) => file.index));
  return [...queued, ...rest];
}

export function queueBlocks(rows: number[], byIndex: Map<number, TorrentFileInfo>): QueueBlock[] {
  const blocks: QueueBlock[] = [];
  for (let at = 0; at < rows.length; at++) {
    const file = byIndex.get(rows[at]);
    if (!file) continue;
    const dir = queueDir(file.name);
    const last = blocks.at(-1);
    if (last?.dir === dir) {
      last.end = at;
      continue;
    }
    blocks.push({ dir, first: rows[at], start: at, end: at });
  }
  return blocks;
}

export function queueBlockOf(
  rows: number[],
  byIndex: Map<number, TorrentFileInfo>,
  target: QueueDragTarget
): QueueBlock | null {
  const at = target.kind === "file" ? rows.indexOf(target.index) : rows.indexOf(target.first);
  if (at === -1) return null;
  return queueBlocks(rows, byIndex).find((block) => at >= block.start && at <= block.end) ?? null;
}

export function moveQueueItem(rows: number[], from: number, insertAt: number): number[] {
  if (from < 0 || from >= rows.length) return rows;
  if (insertAt === from || insertAt === from + 1) return rows;
  const next = rows.filter((_, at) => at !== from);
  next.splice(insertAt > from ? insertAt - 1 : insertAt, 0, rows[from]);
  return next;
}

export function moveQueueBlock(
  rows: number[],
  block: QueueBlock,
  target: QueueBlock,
  place: QueuePlace
): number[] {
  if (block.start === target.start) return rows;
  const size = block.end - block.start + 1;
  const moved = rows.slice(block.start, block.end + 1);
  const rest = [...rows.slice(0, block.start), ...rows.slice(block.end + 1)];
  let insertAt = place === "before" ? target.start : target.end + 1;
  if (insertAt > block.end) insertAt -= size;
  if (insertAt === block.start) return rows;
  rest.splice(insertAt, 0, ...moved);
  return rest;
}

export function queueApplyDrop(
  rows: number[],
  byIndex: Map<number, TorrentFileInfo>,
  active: QueueDragTarget,
  over: QueueDragTarget,
  place: QueuePlace
): number[] {
  const dragged = queueBlockOf(rows, byIndex, active);
  const target = queueBlockOf(rows, byIndex, over);
  if (!dragged || !target) return rows;
  if (active.kind === "folder") {
    return moveQueueBlock(rows, dragged, target, place);
  }
  if (over.kind === "folder" || dragged.start !== target.start) return rows;
  const from = rows.indexOf(active.index);
  const overAt = rows.indexOf(over.index);
  return moveQueueItem(rows, from, place === "after" ? overAt + 1 : overAt);
}

export function queueMoveFileStep(
  rows: number[],
  byIndex: Map<number, TorrentFileInfo>,
  index: number,
  delta: -1 | 1
): number[] {
  const block = queueBlockOf(rows, byIndex, { kind: "file", index });
  const at = rows.indexOf(index);
  if (!block || at === -1) return rows;
  const to = at + delta;
  if (to < block.start || to > block.end) return rows;
  return moveQueueItem(rows, at, delta < 0 ? to : to + 1);
}

export function queueMoveFileEdge(
  rows: number[],
  byIndex: Map<number, TorrentFileInfo>,
  index: number,
  edge: QueueEdge
): number[] {
  const block = queueBlockOf(rows, byIndex, { kind: "file", index });
  const at = rows.indexOf(index);
  if (!block || at === -1) return rows;
  return moveQueueItem(rows, at, edge === "start" ? block.start : block.end + 1);
}

export function queueMoveBlockStep(
  rows: number[],
  byIndex: Map<number, TorrentFileInfo>,
  first: number,
  delta: -1 | 1
): number[] {
  const blocks = queueBlocks(rows, byIndex);
  const at = blocks.findIndex((block) => block.first === first);
  const block = blocks[at];
  const target = blocks[at + delta];
  if (!block || !target) return rows;
  return moveQueueBlock(rows, block, target, delta < 0 ? "before" : "after");
}

export function queueMoveBlockEdge(
  rows: number[],
  byIndex: Map<number, TorrentFileInfo>,
  first: number,
  edge: QueueEdge
): number[] {
  const blocks = queueBlocks(rows, byIndex);
  const block = blocks.find((entry) => entry.first === first);
  const target = edge === "start" ? blocks[0] : blocks.at(-1);
  if (!block || !target) return rows;
  return moveQueueBlock(rows, block, target, edge === "start" ? "before" : "after");
}

export function queuePositions(
  rows: number[],
  included: Set<number>,
  byIndex: Map<number, TorrentFileInfo>
): Map<number, number> {
  const positions = new Map<number, number>();
  for (const index of rows) {
    const file = byIndex.get(index);
    if (!file || file.completed || !included.has(index)) continue;
    positions.set(index, positions.size + 1);
  }
  return positions;
}

export function queueRemainingBytes(
  positions: Map<number, number>,
  byIndex: Map<number, TorrentFileInfo>
): number {
  let total = 0;
  for (const index of positions.keys()) {
    const file = byIndex.get(index);
    if (!file) continue;
    total += Math.max(0, file.size - file.progress_bytes);
  }
  return total;
}

export function queueDisplay(
  rows: number[],
  blocks: QueueBlock[],
  byIndex: Map<number, TorrentFileInfo>,
  positions: Map<number, number>,
  collapsed: Set<string>
): QueueDisplayItem[] {
  const items: QueueDisplayItem[] = [];
  for (const block of blocks) {
    const indices = rows.slice(block.start, block.end + 1);
    let remainingBytes = 0;
    for (const index of indices) {
      const file = byIndex.get(index);
      if (!file || !positions.has(index)) continue;
      remainingBytes += Math.max(0, file.size - file.progress_bytes);
    }
    if (block.dir) {
      const isCollapsed = collapsed.has(block.dir);
      items.push({
        kind: "folder",
        dir: block.dir,
        first: block.first,
        count: indices.length,
        remainingBytes,
        collapsed: isCollapsed,
      });
      if (isCollapsed) continue;
    }
    for (const index of indices) items.push({ kind: "file", index });
  }
  return items;
}

export function queueIncludedOrder(rows: number[], included: Set<number>): number[] {
  return rows.filter((index) => included.has(index));
}

export function queuePointHit(
  display: QueueDisplayItem[],
  offsetY: number,
  rowHeight: number
): { target: QueueDragTarget; place: QueuePlace } | null {
  if (display.length === 0 || rowHeight <= 0) return null;
  const at = Math.min(display.length - 1, Math.max(0, Math.floor(offsetY / rowHeight)));
  const item = display[at];
  if (!item) return null;
  const within = offsetY - at * rowHeight;
  const place: QueuePlace = within < rowHeight / 2 ? "before" : "after";
  const target: QueueDragTarget =
    item.kind === "file"
      ? { kind: "file", index: item.index }
      : { kind: "folder", first: item.first };
  return { target, place };
}

export function queuePayload(
  rows: number[],
  included: Set<number>,
  byIndex: Map<number, TorrentFileInfo>,
  initialIncluded: Set<number>,
  enableSequential: boolean
): TorrentQueueApply {
  const order = rows.filter(
    (index) => included.has(index) && byIndex.get(index)?.completed === false
  );
  const selected = [...included].filter(
    (index) => !initialIncluded.has(index) && byIndex.get(index)?.completed === false
  );
  const deselected = [...initialIncluded].filter((index) => !included.has(index));
  return { order, selected, deselected, enableSequential };
}

export function downloadOrderPositions(
  files: TorrentFileInfo[],
  order: number[]
): Map<number, number> {
  const byIndex = new Map(files.map((file) => [file.index, file]));
  const positions = new Map<number, number>();
  for (const index of order) {
    const file = byIndex.get(index);
    if (!file || file.completed || !file.selected || positions.has(index)) continue;
    positions.set(index, positions.size + 1);
  }
  return positions;
}
