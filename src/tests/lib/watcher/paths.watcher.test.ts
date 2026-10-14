import { describe, expect, it } from "vitest";

import { changedRoots, isSameOrInside, normalizePath, samePath } from "@/lib/watcher/paths.watcher";
import type { FolderContentChanged } from "@/types/watcher";

describe("normalizePath", () => {
  it("unifies separators and case", () => {
    expect(normalizePath("C:\\Anime\\EP01.MKV")).toBe("c:/anime/ep01.mkv");
    expect(normalizePath("c:/anime/ep01.mkv")).toBe("c:/anime/ep01.mkv");
  });
});

describe("samePath", () => {
  it("ignores separators and case", () => {
    expect(samePath("C:\\Anime\\ep01.mkv", "c:/anime/EP01.MKV")).toBe(true);
    expect(samePath("c:/anime/ep01.mkv", "c:/anime/ep02.mkv")).toBe(false);
  });
});

describe("isSameOrInside", () => {
  it("matches the folder itself and its descendants", () => {
    expect(isSameOrInside("C:/Anime", "C:/Anime")).toBe(true);
    expect(isSameOrInside("C:/Anime", "C:/Anime/Season 1/ep01.mkv")).toBe(true);
  });

  it("does not match siblings or prefix-only names", () => {
    expect(isSameOrInside("C:/Anime", "C:/AnimeExtra/ep01.mkv")).toBe(false);
    expect(isSameOrInside("C:/Anime/Season 1", "C:/Anime/ep01.mkv")).toBe(false);
  });
});

describe("changedRoots", () => {
  it("deduplicates roots while preserving order", () => {
    const payload: FolderContentChanged = {
      roots: ["C:/A", "C:/B", "C:/A"],
      changes: [],
    };
    expect(changedRoots(payload)).toEqual(["C:/A", "C:/B"]);
  });
});
