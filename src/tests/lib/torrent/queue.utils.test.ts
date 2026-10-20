import { describe, expect, it } from "vitest";

import {
  buildQueueRows,
  downloadOrderPositions,
  moveQueueBlock,
  moveQueueItem,
  queueApplyDrop,
  queueBlocks,
  queueDisplay,
  queueMoveBlockEdge,
  queueMoveBlockStep,
  queueMoveFileEdge,
  queueMoveFileStep,
  queuePayload,
  queuePointHit,
  queuePositions,
  queueRemainingBytes,
} from "@/lib/torrent/queue.utils";
import type { TorrentFileInfo } from "@/types/torrent";

function file(
  index: number,
  name: string,
  overrides: Partial<TorrentFileInfo> = {}
): TorrentFileInfo {
  return {
    index,
    name,
    size: 100,
    progress_bytes: 0,
    completed: false,
    selected: true,
    priority: "normal",
    exists: true,
    ...overrides,
  };
}

function index(files: TorrentFileInfo[]): Map<number, TorrentFileInfo> {
  return new Map(files.map((entry) => [entry.index, entry]));
}

const FILES = [
  file(0, "B/b1.mkv"),
  file(1, "A/a1.mkv"),
  file(2, "A/a2.mkv"),
  file(3, "C/c1.mkv", { completed: true }),
  file(4, "B/b2.mkv", { selected: false }),
];

describe("buildQueueRows", () => {
  it("puts the saved order first and completes it from the directory order", () => {
    expect(buildQueueRows(FILES, [2], "list")).toEqual([2, 1, 0, 4]);
  });

  it("falls back to the torrent order for the remaining files", () => {
    expect(buildQueueRows(FILES, [], "torrent")).toEqual([0, 1, 2, 4]);
  });

  it("drops completed files, unknown indices, and repeats", () => {
    expect(buildQueueRows(FILES, [3, 99, 2, 2, 0], "torrent")).toEqual([2, 0, 1, 4]);
  });
});

describe("queueBlocks", () => {
  it("groups consecutive files of one folder and keeps root files together", () => {
    const files = [
      file(0, "A/a1"),
      file(1, "A/a2"),
      file(2, "B/b1"),
      file(3, "root1"),
      file(4, "root2"),
    ];
    expect(queueBlocks([0, 1, 2, 3, 4], index(files))).toEqual([
      { dir: "A", first: 0, start: 0, end: 1 },
      { dir: "B", first: 2, start: 2, end: 2 },
      { dir: "", first: 3, start: 3, end: 4 },
    ]);
  });
});

describe("moveQueueItem", () => {
  it("moves a row before and after its neighbours", () => {
    expect(moveQueueItem([0, 1, 2, 3], 0, 2)).toEqual([1, 0, 2, 3]);
    expect(moveQueueItem([0, 1, 2, 3], 0, 3)).toEqual([1, 2, 0, 3]);
    expect(moveQueueItem([0, 1, 2, 3], 3, 0)).toEqual([3, 0, 1, 2]);
  });

  it("returns the same array for a no-op or a bad index", () => {
    const rows = [0, 1, 2];
    expect(moveQueueItem(rows, 1, 1)).toBe(rows);
    expect(moveQueueItem(rows, 1, 2)).toBe(rows);
    expect(moveQueueItem(rows, 9, 0)).toBe(rows);
  });
});

describe("moveQueueBlock", () => {
  const files = [file(0, "A/a1"), file(1, "A/a2"), file(2, "B/b1"), file(3, "B/b2")];
  const blocks = queueBlocks([0, 1, 2, 3], index(files));

  it("moves a whole folder after another one and back", () => {
    const moved = moveQueueBlock([0, 1, 2, 3], blocks[0], blocks[1], "after");
    expect(moved).toEqual([2, 3, 0, 1]);
    const movedBlocks = queueBlocks(moved, index(files));
    expect(moveQueueBlock(moved, movedBlocks[1], movedBlocks[0], "before")).toEqual([0, 1, 2, 3]);
  });

  it("keeps the same array when the block is already there", () => {
    const rows = [0, 1, 2, 3];
    expect(moveQueueBlock(rows, blocks[0], blocks[1], "before")).toBe(rows);
    expect(moveQueueBlock(rows, blocks[1], blocks[0], "after")).toBe(rows);
  });
});

describe("queueApplyDrop", () => {
  const files = [
    file(0, "A/a1"),
    file(1, "A/a2"),
    file(2, "A/a3"),
    file(3, "B/b1"),
    file(4, "B/b2"),
  ];
  const byIndex = index(files);
  const rows = [0, 1, 2, 3, 4];

  it("reorders files inside their own folder", () => {
    expect(
      queueApplyDrop(rows, byIndex, { kind: "file", index: 0 }, { kind: "file", index: 2 }, "after")
    ).toEqual([1, 2, 0, 3, 4]);
  });

  it("refuses to move a file into another folder", () => {
    expect(
      queueApplyDrop(
        rows,
        byIndex,
        { kind: "file", index: 0 },
        { kind: "file", index: 3 },
        "before"
      )
    ).toBe(rows);
    expect(
      queueApplyDrop(
        rows,
        byIndex,
        { kind: "file", index: 0 },
        { kind: "folder", first: 3 },
        "before"
      )
    ).toBe(rows);
  });

  it("moves a folder over a file of another folder", () => {
    expect(
      queueApplyDrop(
        rows,
        byIndex,
        { kind: "folder", first: 3 },
        { kind: "file", index: 1 },
        "before"
      )
    ).toEqual([3, 4, 0, 1, 2]);
  });

  it("keeps a folder in place when dropped on itself", () => {
    expect(
      queueApplyDrop(
        rows,
        byIndex,
        { kind: "folder", first: 0 },
        { kind: "file", index: 2 },
        "after"
      )
    ).toBe(rows);
  });
});

describe("keyboard moves", () => {
  const files = [file(0, "A/a1"), file(1, "A/a2"), file(2, "B/b1"), file(3, "B/b2")];
  const byIndex = index(files);
  const rows = [0, 1, 2, 3];

  it("steps a file inside its folder and stops at the edges", () => {
    expect(queueMoveFileStep(rows, byIndex, 0, 1)).toEqual([1, 0, 2, 3]);
    expect(queueMoveFileStep(rows, byIndex, 1, 1)).toBe(rows);
    expect(queueMoveFileStep(rows, byIndex, 2, -1)).toBe(rows);
    expect(queueMoveFileStep(rows, byIndex, 3, -1)).toEqual([0, 1, 3, 2]);
  });

  it("jumps a file to the start or the end of its folder", () => {
    expect(queueMoveFileEdge(rows, byIndex, 0, "end")).toEqual([1, 0, 2, 3]);
    expect(queueMoveFileEdge(rows, byIndex, 3, "start")).toEqual([0, 1, 3, 2]);
    expect(queueMoveFileEdge(rows, byIndex, 0, "start")).toBe(rows);
  });

  it("steps a folder over its neighbour and stops at the edge", () => {
    expect(queueMoveBlockStep(rows, byIndex, 0, 1)).toEqual([2, 3, 0, 1]);
    expect(queueMoveBlockStep(rows, byIndex, 2, -1)).toEqual([2, 3, 0, 1]);
    expect(queueMoveBlockStep(rows, byIndex, 0, -1)).toBe(rows);
    expect(queueMoveBlockStep(rows, byIndex, 2, 1)).toBe(rows);
  });

  it("jumps a folder to the top or the bottom", () => {
    expect(queueMoveBlockEdge(rows, byIndex, 2, "start")).toEqual([2, 3, 0, 1]);
    expect(queueMoveBlockEdge(rows, byIndex, 0, "end")).toEqual([2, 3, 0, 1]);
    expect(queueMoveBlockEdge(rows, byIndex, 0, "start")).toBe(rows);
  });
});

describe("queuePositions", () => {
  it("numbers only unfinished files", () => {
    const files = [
      file(0, "A/a1"),
      file(1, "A/a2", { completed: true }),
      file(2, "A/a3", { selected: false }),
    ];
    const included = new Set([0, 1, 2]);
    const positions = queuePositions([0, 1, 2], included, index(files));
    expect([...positions.entries()]).toEqual([
      [0, 1],
      [2, 2],
    ]);
    expect(queueRemainingBytes(positions, index(files))).toBe(200);
  });

  it("skips files that left the queue", () => {
    const files = [file(0, "A/a1"), file(1, "A/a2")];
    expect([...queuePositions([1, 0], new Set([1]), index(files)).entries()]).toEqual([[1, 1]]);
  });
});

describe("queueDisplay", () => {
  const files = [file(0, "A/a1", { progress_bytes: 40 }), file(1, "A/a2"), file(2, "B/b1")];
  const byIndex = index(files);
  const blocks = queueBlocks([0, 1, 2], byIndex);
  const positions = queuePositions([0, 1, 2], new Set([0, 1, 2]), byIndex);

  it("renders folder headers with the remaining size and then the files", () => {
    expect(queueDisplay([0, 1, 2], blocks, byIndex, positions, new Set())).toEqual([
      { kind: "folder", dir: "A", first: 0, count: 2, remainingBytes: 160, collapsed: false },
      { kind: "file", index: 0 },
      { kind: "file", index: 1 },
      { kind: "folder", dir: "B", first: 2, count: 1, remainingBytes: 100, collapsed: false },
      { kind: "file", index: 2 },
    ]);
  });

  it("hides the files of a collapsed folder", () => {
    expect(queueDisplay([0, 1, 2], blocks, byIndex, positions, new Set(["A"]))).toEqual([
      { kind: "folder", dir: "A", first: 0, count: 2, remainingBytes: 160, collapsed: true },
      { kind: "folder", dir: "B", first: 2, count: 1, remainingBytes: 100, collapsed: false },
      { kind: "file", index: 2 },
    ]);
  });

  it("keeps root files without a header", () => {
    const rootFiles = [file(0, "a1"), file(1, "a2")];
    const map = index(rootFiles);
    const rootBlocks = queueBlocks([0, 1], map);
    expect(queueDisplay([0, 1], rootBlocks, map, new Map(), new Set())).toEqual([
      { kind: "file", index: 0 },
      { kind: "file", index: 1 },
    ]);
  });
});

describe("queuePointHit", () => {
  const files = [file(0, "A/a1"), file(1, "A/a2"), file(2, "B/b1")];
  const byIndex = index(files);
  const blocks = queueBlocks([0, 1, 2], byIndex);
  const positions = queuePositions([0, 1, 2], new Set([0, 1, 2]), byIndex);
  const display = queueDisplay([0, 1, 2], blocks, byIndex, positions, new Set());

  it("maps the pointer to the folder and file rows", () => {
    expect(queuePointHit(display, 0, 20)).toEqual({
      target: { kind: "folder", first: 0 },
      place: "before",
    });
    expect(queuePointHit(display, 25, 20)).toEqual({
      target: { kind: "file", index: 0 },
      place: "before",
    });
    expect(queuePointHit(display, 95, 20)).toEqual({
      target: { kind: "file", index: 2 },
      place: "after",
    });
  });

  it("splits every row into a before and an after half", () => {
    expect(queuePointHit(display, 29, 20)?.place).toBe("before");
    expect(queuePointHit(display, 30, 20)?.place).toBe("after");
  });

  it("clamps the pointer above and below the list to the nearest row", () => {
    expect(queuePointHit(display, -50, 20)).toEqual({
      target: { kind: "folder", first: 0 },
      place: "before",
    });
    expect(queuePointHit(display, 500, 20)).toEqual({
      target: { kind: "file", index: 2 },
      place: "after",
    });
  });

  it("returns null for an empty list or a broken row height", () => {
    expect(queuePointHit([], 10, 20)).toBeNull();
    expect(queuePointHit(display, 10, 0)).toBeNull();
  });
});

describe("queuePayload", () => {
  const files = [
    file(0, "A/a1"),
    file(1, "A/a2"),
    file(2, "B/b1", { completed: true }),
    file(3, "B/b2", { selected: false }),
  ];
  const byIndex = index(files);

  it("sends the checked unfinished files in order and the selection diff", () => {
    const initialIncluded = new Set([0, 1]);
    const payload = queuePayload([1, 3, 0, 2], new Set([0, 3]), byIndex, initialIncluded, true);
    expect(payload).toEqual({
      order: [3, 0],
      selected: [3],
      deselected: [1],
      enableSequential: true,
    });
  });

  it("never selects a completed file", () => {
    const payload = queuePayload([0, 1, 2], new Set([0, 1, 2]), byIndex, new Set([1, 2]), false);
    expect(payload.order).toEqual([0, 1]);
    expect(payload.selected).toEqual([0]);
    expect(payload.enableSequential).toBe(false);
  });
});

describe("downloadOrderPositions", () => {
  it("numbers selected unfinished files and ignores repeats and unknown indices", () => {
    const files = [
      file(0, "a", { selected: false }),
      file(1, "b"),
      file(2, "c"),
      file(3, "d", { completed: true }),
    ];
    expect([...downloadOrderPositions(files, [2, 1, 1, 3, 9]).entries()]).toEqual([
      [2, 1],
      [1, 2],
    ]);
  });
});
