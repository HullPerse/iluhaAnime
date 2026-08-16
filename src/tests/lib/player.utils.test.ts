import { describe, expect, it } from "vitest";

import { translate } from "@/lib/i18n";
import {
  buildOutputPath,
  buildTree,
  fileNameFromPath,
  filterTreeByPaths,
  flattenTree,
  formatETA,
  formatParsedTitle,
} from "@/lib/player.utils";

const ru = (
  key: Parameters<typeof translate>[1],
  vars?: Parameters<typeof translate>[2]
) => translate("ru", key, vars);

function makeEntry(path: string, name: string, size = 100) {
  return { name, path, size };
}

describe("buildTree", () => {
  it("builds a flat root with files directly inside", () => {
    const tree = buildTree(
      [makeEntry("C:\\Anime\\movie.mkv", "movie.mkv")],
      "C:\\Anime"
    );
    expect(tree.name).toBe("Anime");
    expect(tree.files.map((f) => f.name)).toEqual(["movie.mkv"]);
    expect(tree.children).toEqual([]);
  });

  it("groups nested paths into folders", () => {
    const tree = buildTree(
      [
        makeEntry("C:\\Anime\\One Piece\\ep1.mkv", "ep1.mkv"),
        makeEntry("C:\\Anime\\One Piece\\ep2.mkv", "ep2.mkv"),
        makeEntry("C:\\Anime\\movie.mkv", "movie.mkv"),
      ],
      "C:\\Anime"
    );
    expect(tree.files.map((f) => f.name)).toEqual(["movie.mkv"]);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].name).toBe("One Piece");
    expect(tree.children[0].files.map((f) => f.name)).toEqual([
      "ep1.mkv",
      "ep2.mkv",
    ]);
  });
});

describe("filterTreeByPaths", () => {
  it("keeps only matching files and prunes empty folders", () => {
    const tree = buildTree(
      [
        makeEntry("C:\\Anime\\One Piece\\ep1.mkv", "ep1.mkv"),
        makeEntry("C:\\Anime\\movie.mkv", "movie.mkv"),
      ],
      "C:\\Anime"
    );
    const filtered = filterTreeByPaths(tree, new Set(["C:\\Anime\\movie.mkv"]));
    expect(filtered).not.toBeNull();
    expect(filtered!.files.map((f) => f.name)).toEqual(["movie.mkv"]);
    expect(filtered!.children).toEqual([]);
  });

  it("returns null when nothing matches", () => {
    const tree = buildTree(
      [makeEntry("C:\\Anime\\movie.mkv", "movie.mkv")],
      "C:\\Anime"
    );
    expect(filterTreeByPaths(tree, new Set(["C:\\missing.mkv"]))).toBeNull();
  });
});

describe("flattenTree", () => {
  it("flattens root files at depth 1 when the root is open", () => {
    const tree = buildTree(
      [
        makeEntry("C:\\Anime\\a.mkv", "a.mkv"),
        makeEntry("C:\\Anime\\b.mp4", "b.mp4"),
      ],
      "C:\\Anime"
    );
    const items = flattenTree(tree, new Set(), "", undefined, 0);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind === "file" && i.depth === 1)).toBe(true);
  });

  it("pushes folder items for closed children without their files", () => {
    const tree = buildTree(
      [makeEntry("C:\\Anime\\Movies\\c.mkv", "c.mkv")],
      "C:\\Anime"
    );
    const items = flattenTree(tree, new Set(), "", undefined, 0);
    const folders = items.filter((i) => i.kind === "folder");
    expect(folders).toHaveLength(1);
    expect(folders[0].kind === "folder" && folders[0].node.name).toBe("Movies");
    expect(items.some((i) => i.kind === "file")).toBe(false);
  });

  it("expands open children and includes their files", () => {
    const tree = buildTree(
      [makeEntry("C:\\Anime\\Movies\\c.mkv", "c.mkv")],
      "C:\\Anime"
    );
    const items = flattenTree(
      tree,
      new Set(["C:\\Anime/Movies"]),
      "",
      undefined,
      0
    );
    expect(items.some((i) => i.kind === "file")).toBe(true);
  });

  it("filters files by search query", () => {
    const tree = buildTree(
      [
        makeEntry("C:\\Anime\\naruto.mkv", "naruto.mkv"),
        makeEntry("C:\\Anime\\bleach.mkv", "bleach.mkv"),
      ],
      "C:\\Anime"
    );
    const items = flattenTree(tree, new Set(), "naru", undefined, 0);
    const files = items.filter((i) => i.kind === "file");
    expect(files).toHaveLength(1);
    expect(files[0].kind === "file" && files[0].file.name).toBe("naruto.mkv");
  });

  it("hides files with disabled extensions", () => {
    const tree = buildTree(
      [
        makeEntry("C:\\Anime\\a.mkv", "a.mkv"),
        makeEntry("C:\\Anime\\b.mp4", "b.mp4"),
      ],
      "C:\\Anime"
    );
    const items = flattenTree(tree, new Set(), "", new Set(["mp4"]), 0);
    const files = items.filter((i) => i.kind === "file");
    expect(files).toHaveLength(1);
    expect(files[0].kind === "file" && files[0].file.name).toBe("a.mkv");
  });

  it("prunes folders whose content was filtered out by track extensions", () => {
    const tree = buildTree(
      [makeEntry("C:\\Anime\\Subs\\ep1.ass", "ep1.ass")],
      "C:\\Anime"
    );
    const items = flattenTree(
      tree,
      new Set(),
      "",
      undefined,
      0,
      new Set(["ass"])
    );
    expect(items).toHaveLength(0);
  });
});

describe("buildOutputPath", () => {
  it("inserts the suffix before the extension", () => {
    expect(buildOutputPath("C:\\Anime\\ep1.mkv", ".720p")).toBe(
      "C:\\Anime\\ep1.720p.mkv"
    );
  });

  it("appends the suffix when there is no extension", () => {
    expect(buildOutputPath("ep1", "-tag")).toBe("ep1-tag");
  });

  it("handles dotted filenames correctly", () => {
    expect(buildOutputPath("file.tar.gz", ".x")).toBe("file.tar.x.gz");
  });
});

describe("formatParsedTitle", () => {
  it("formats a simple episode", () => {
    expect(formatParsedTitle("[Erai-raws] Naruto - 01 [1080p].mkv", ru)).toBe(
      "Naruto, Серия 1"
    );
  });

  it("includes season when present", () => {
    expect(formatParsedTitle("Sword Art Online - S01E02 - Title.mkv", ru)).toBe(
      "Sword Art Online, Сезон 1, Серия 2"
    );
  });

  it("handles zero-padded episode numbers", () => {
    expect(formatParsedTitle("One Piece 001.mkv", ru)).toBe(
      "One Piece, Серия 1"
    );
  });
});

describe("fileNameFromPath", () => {
  it("handles windows and posix separators", () => {
    expect(fileNameFromPath("C:\\Anime\\ep1.mkv")).toBe("ep1.mkv");
    expect(fileNameFromPath("a/b/c.mp4")).toBe("c.mp4");
  });

  it("returns the input when there is no separator", () => {
    expect(fileNameFromPath("ep1.mkv")).toBe("ep1.mkv");
  });
});

describe("formatETA", () => {
  it("returns a short label for zero or invalid values", () => {
    expect(formatETA(0, ru)).toBe("< 1 мин");
    expect(formatETA(Infinity, ru)).toBe("");
    expect(formatETA(Number.NaN, ru)).toBe("");
  });

  it("formats seconds", () => {
    expect(formatETA(30, ru)).toBe("30 сек");
  });

  it("formats minutes and seconds", () => {
    expect(formatETA(90, ru)).toBe("1 мин 30 сек");
  });
});
