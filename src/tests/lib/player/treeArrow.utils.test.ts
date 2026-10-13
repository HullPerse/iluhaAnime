import { describe, expect, it } from "vitest";

import { resolveTreeArrow, resolveTreeMove } from "@/lib/player/treeArrow.utils";
import type { TreeRow } from "@/lib/player/treeArrow.utils";

function folder(path: string, depth: number, expanded: boolean): TreeRow {
  return { path, depth, kind: "folder", expanded };
}

function file(path: string, depth: number): TreeRow {
  return { path, depth, kind: "file", expanded: false };
}

// A/ (open) with B/ (closed) inside it, B's episode, and a sibling folder D/.
const ROWS: TreeRow[] = [
  folder("A", 0, true),
  folder("B", 1, false),
  file("B/ep1.mkv", 2),
  file("A/extra.mkv", 1),
  folder("D", 0, false),
];

describe("player/tree arrows", () => {
  it("closes an expanded folder with Left", () => {
    expect(resolveTreeArrow(ROWS, "A", "left")).toEqual({ kind: "toggle", path: "A" });
  });

  it("walks to the parent folder with Left", () => {
    expect(resolveTreeArrow(ROWS, "B", "left")).toEqual({ kind: "focus", path: "A" });
    expect(resolveTreeArrow(ROWS, "B/ep1.mkv", "left")).toEqual({ kind: "focus", path: "B" });
  });

  it("offers nothing for a collapsed root row", () => {
    expect(resolveTreeArrow(ROWS, "D", "left")).toBeNull();
  });

  it("opens a collapsed folder with Right", () => {
    expect(resolveTreeArrow(ROWS, "B", "right")).toEqual({ kind: "toggle", path: "B" });
  });

  it("walks to the first child with Right", () => {
    expect(resolveTreeArrow(ROWS, "A", "right")).toEqual({ kind: "focus", path: "B" });
  });

  it("leaves Right alone on a file row", () => {
    expect(resolveTreeArrow(ROWS, "A/extra.mkv", "right")).toBeNull();
  });

  it("stays put on an expanded row whose first child is a sibling", () => {
    const flat: TreeRow[] = [folder("A", 0, true), folder("D", 0, false)];
    expect(resolveTreeArrow(flat, "A", "right")).toBeNull();
  });

  it("ignores a row that is not in the visible list", () => {
    expect(resolveTreeArrow(ROWS, "gone", "left")).toBeNull();
    expect(resolveTreeArrow([], "A", "right")).toBeNull();
  });
});

describe("player/tree movement", () => {
  it("steps over folders and files alike", () => {
    expect(resolveTreeMove(ROWS, "A", 1)).toBe("B");
    expect(resolveTreeMove(ROWS, "B", 1)).toBe("B/ep1.mkv");
    expect(resolveTreeMove(ROWS, "B/ep1.mkv", -1)).toBe("B");
  });

  it("clamps at both ends instead of wrapping", () => {
    expect(resolveTreeMove(ROWS, "A", -1)).toBe("A");
    expect(resolveTreeMove(ROWS, "D", 1)).toBe("D");
  });

  it("offers nothing for a row that left the list", () => {
    expect(resolveTreeMove(ROWS, "gone", 1)).toBeNull();
    expect(resolveTreeMove([], "A", 1)).toBeNull();
  });
});
