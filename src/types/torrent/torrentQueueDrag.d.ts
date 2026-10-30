import type { KeyboardEvent, PointerEvent, RefObject } from "react";

import type { TorrentFileInfo } from "@/types/torrent/torrent";
import type {
  QueueBlock,
  QueueDisplayItem,
  QueueDragTarget,
  QueuePlace,
} from "@/types/torrent/torrentQueue";

export interface QueueHint {
  target: QueueDragTarget;
  place: QueuePlace;
}

export interface QueueSnapshot {
  rows: number[];
  included: Set<number>;
}

export interface QueueGhost {
  x: number;
  y: number;
  width: number;
}

export interface QueueScroll {
  scrollToIndex: (index: number, options?: { align?: "auto" | "start" | "center" | "end" }) => void;
}

export interface QueueDragState {
  target: QueueDragTarget;
  pointerId: number;
  clientY: number;
  grabY: number;
  raf: number;
  stop: () => void;
}

export interface QueueListProps {
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
}
