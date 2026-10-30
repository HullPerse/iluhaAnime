import { queueBlockOf, queueDir } from "@/lib/torrent/torrentQueue.utils";
import type { TorrentFileInfo } from "@/types/torrent/torrent";
import type { QueueDragTarget } from "@/types/torrent/torrentQueue";

export function sameQueueTarget(left: QueueDragTarget | null, right: QueueDragTarget): boolean {
  if (!left || left.kind !== right.kind) return false;
  if (left.kind === "file" && right.kind === "file") return left.index === right.index;
  if (left.kind === "folder" && right.kind === "folder") return left.first === right.first;
  return false;
}

export function canQueueDrop(
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

export function queueDragLabel(
  drag: QueueDragTarget | null,
  byIndex: Map<number, TorrentFileInfo>
): string {
  if (!drag) return "";
  if (drag.kind === "file") return byIndex.get(drag.index)?.name ?? "";
  return queueDir(byIndex.get(drag.first)?.name ?? "");
}
