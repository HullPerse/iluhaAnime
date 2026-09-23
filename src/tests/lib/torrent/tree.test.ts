import { describe, expect, it } from "vitest";

import {
  applyFolderSelection,
  buildTorrentTree,
  collectFileIndices,
  groupFilesByDirectory,
} from "@/lib/torrent/tree.utils";
import type { TorrentTreeNode } from "@/types/torrent";

describe("collectFileIndices", () => {
  it("collects indices from files and nested children", () => {
    const tree: TorrentTreeNode = {
      children: [
        {
          name: "extras",
          files: [
            {
              index: 3,
              name: "b.mkv",
              displayName: "b.mkv",
              size: 1,
              progress_bytes: 0,
              completed: false,
              selected: true,
              priority: "normal",
              exists: false,
            },
          ],
          children: [],
        },
      ],
      files: [
        {
          index: 0,
          name: "a.mkv",
          displayName: "a.mkv",
          size: 1,
          progress_bytes: 0,
          completed: false,
          selected: true,
          priority: "normal",
          exists: false,
        },
      ],
      name: "Season 1",
    };
    expect(collectFileIndices(tree).sort((a, b) => a - b)).toEqual([0, 3]);
  });

  it("returns an empty array for an empty tree", () => {
    const tree: TorrentTreeNode = { children: [], files: [], name: "" };
    expect(collectFileIndices(tree)).toEqual([]);
  });
});

describe("applyFolderSelection", () => {
  const entry = (index: number, selected: boolean, completed = false) => ({
    index,
    selected,
    completed,
  });

  it("selects the folder without touching the files around it", () => {
    const files = [entry(0, true), entry(1, false), entry(2, false), entry(3, true)];

    expect(applyFolderSelection(files, [1, 2], true)).toEqual([0, 1, 2, 3]);
  });

  it("unchecks the folder and leaves the rest selected", () => {
    const files = [entry(0, true), entry(1, true), entry(2, true), entry(3, true)];

    expect(applyFolderSelection(files, [1, 2], false)).toEqual([0, 3]);
  });

  it("keeps finished files in the download even when their folder is unchecked", () => {
    const files = [entry(0, true, true), entry(1, true), entry(2, false)];

    expect(applyFolderSelection(files, [0, 1], false)).toEqual([0]);
  });
});

describe("buildTorrentTree", () => {
  it("groups files into a nested sorted tree", () => {
    const { nodes, rootFiles } = buildTorrentTree([
      {
        completed: false,
        exists: false,
        index: 0,
        name: "Season 1/ep1.mkv",
        priority: "normal",
        progress_bytes: 10,
        selected: true,
        size: 100,
      },
      {
        completed: false,
        exists: false,
        index: 1,
        name: "Season 1/ep2.mkv",
        priority: "normal",
        progress_bytes: 0,
        selected: true,
        size: 100,
      },
      {
        completed: true,
        exists: true,
        index: 2,
        name: "movie.mkv",
        priority: "normal",
        progress_bytes: 100,
        selected: true,
        size: 100,
      },
    ]);
    expect(rootFiles.map((f) => f.displayName)).toEqual(["movie.mkv"]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe("Season 1");
    expect(nodes[0].files.map((f) => f.displayName)).toEqual(["ep1.mkv", "ep2.mkv"]);
  });

  it("lists every file flat, in torrent order", () => {
    const { nodes, rootFiles } = buildTorrentTree(
      [
        {
          completed: false,
          exists: false,
          index: 2,
          name: "Season 1/ep1.mkv",
          priority: "normal",
          progress_bytes: 0,
          selected: true,
          size: 100,
        },
        {
          completed: false,
          exists: false,
          index: 0,
          name: "ep6.mkv",
          priority: "normal",
          progress_bytes: 0,
          selected: true,
          size: 100,
        },
      ],
      "torrent"
    );

    expect(rootFiles.map((f) => f.index)).toEqual([0, 2]);
    expect(rootFiles.map((f) => f.displayName)).toEqual(["ep6.mkv", "Season 1/ep1.mkv"]);
    expect(nodes).toEqual([]);
  });
});

describe("groupFilesByDirectory", () => {
  it("groups nested files and sorts directories", () => {
    const groups = groupFilesByDirectory([
      { index: 0, name: "Season 1/ep1.mkv", size: 1 },
      { index: 1, name: "Movie/movie.mkv", size: 1 },
      { index: 2, name: "root.mkv", size: 1 },
    ]);
    expect(groups.map((g) => g.dir)).toEqual(["", "Movie", "Season 1"]);
    expect(groups[0].files[0].displayName).toBe("root.mkv");
    expect(groups[1].files[0].displayName).toBe("movie.mkv");
  });

  it("keeps one group in torrent order and shows full paths", () => {
    const groups = groupFilesByDirectory(
      [
        { index: 2, name: "Season 1/ep1.mkv", size: 1 },
        { index: 0, name: "Movie/movie.mkv", size: 1 },
        { index: 1, name: "root.mkv", size: 1 },
      ],
      "torrent"
    );

    expect(groups.map((g) => g.dir)).toEqual([""]);
    expect(groups[0].files.map((f) => f.displayName)).toEqual([
      "Movie/movie.mkv",
      "root.mkv",
      "Season 1/ep1.mkv",
    ]);
  });

  it("returns no groups for an empty torrent in torrent order", () => {
    expect(groupFilesByDirectory([], "torrent")).toEqual([]);
  });
});
