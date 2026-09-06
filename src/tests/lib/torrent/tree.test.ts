import { describe, expect, it } from "vitest";

import {
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
});
