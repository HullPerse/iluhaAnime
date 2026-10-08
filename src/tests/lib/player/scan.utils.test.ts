import { describe, expect, it } from "vitest";

import { folderTreesFromScan, fingerprint } from "@/lib/player/scan.utils";
import type { FolderScanResult } from "@/types/fs";

function result(path: string, files: string[]): FolderScanResult {
  return {
    path,
    entries: files.map((name) => ({ path: `${path}/${name}`, name, size: 100 })),
    skipped: 0,
  };
}

describe("player/scan fingerprint", () => {
  it("covers both extensions and paths", () => {
    expect(fingerprint(["b", "a"], ["mkv"])).not.toBe(fingerprint(["a", "b"], ["mkv"]));
    expect(fingerprint(["a"], ["mkv"])).not.toBe(fingerprint(["a"], ["mp4"]));
  });

  it("is stable for identical inputs", () => {
    expect(fingerprint(["a"], ["mkv"])).toBe(fingerprint(["a"], ["mkv"]));
  });
});

describe("player/scan folderTreesFromScan", () => {
  it("returns no trees for an empty batch", () => {
    expect(folderTreesFromScan([])).toEqual([]);
  });

  it("drops folders without entries instead of emitting empty trees", () => {
    const trees = folderTreesFromScan([result("D:/Anime/Empty", [])]);
    expect(trees).toEqual([]);
  });

  it("builds one tree per folder with entries", () => {
    const trees = folderTreesFromScan([
      result("D:/Anime/A", ["a.mkv"]),
      result("D:/Anime/B", ["b.mkv", "c.mkv"]),
    ]);
    expect(trees.map((tree) => tree.path)).toEqual(["D:/Anime/A", "D:/Anime/B"]);
    expect(trees[1]?.files.map((file) => file.name)).toEqual(["b.mkv", "c.mkv"]);
  });

  it("keeps the batch order of folders", () => {
    const trees = folderTreesFromScan([
      result("D:/Anime/B", ["b.mkv"]),
      result("D:/Anime/A", ["a.mkv"]),
    ]);
    expect(trees.map((tree) => tree.path)).toEqual(["D:/Anime/B", "D:/Anime/A"]);
  });

  it("groups nested paths under the folder root", () => {
    const trees = folderTreesFromScan([
      {
        path: "D:/Anime",
        entries: [
          { path: "D:/Anime/Show/ep1.mkv", name: "ep1.mkv", size: 10 },
          { path: "D:/Anime/movie.mkv", name: "movie.mkv", size: 20 },
        ],
        skipped: 2,
      },
    ]);
    expect(trees).toHaveLength(1);
    expect(trees[0]?.children.map((child) => child.name).sort()).toEqual(["Show"]);
    expect(trees[0]?.files.map((file) => file.name)).toEqual(["movie.mkv"]);
  });
});
