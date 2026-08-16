import { describe, expect, it } from "vitest";

import {
  filterTreeByHiddenPaths,
  isPlayerPathHidden,
  normalizePlayerPath,
} from "@/lib/player.visibility";
import type { FolderNode } from "@/types";

const tree: FolderNode = {
  children: [
    {
      name: "Hidden",
      path: "C:\\Anime\\Hidden",
      files: [
        {
          path: "C:\\Anime\\Hidden\\episode.mkv",
          name: "episode.mkv",
          size: 1,
        },
      ],
      children: [],
    },
    {
      name: "Visible",
      path: "C:\\Anime\\Visible",
      files: [
        {
          path: "C:\\Anime\\Visible\\episode.mkv",
          name: "episode.mkv",
          size: 1,
        },
      ],
      children: [],
    },
  ],
  files: [{ path: "C:\\Anime\\movie.mkv", name: "movie.mkv", size: 1 }],
  name: "Anime",
  path: "C:\\Anime",
};

describe("player visibility helpers", () => {
  it("normalizes Windows separators and trailing slashes", () => {
    expect(normalizePlayerPath("C:\\Anime\\")).toBe("c:/anime");
    expect(
      isPlayerPathHidden("C:\\Anime\\Hidden\\episode.mkv", ["c:/anime/hidden"])
    ).toBe(true);
  });

  it("removes a hidden nested folder without mutating the source tree", () => {
    const filtered = filterTreeByHiddenPaths(tree, ["C:/Anime/Hidden"]);
    expect(filtered?.children.map((child) => child.name)).toEqual(["Visible"]);
    expect(tree.children).toHaveLength(2);
  });

  it("removes the whole saved-folder root when it is hidden", () => {
    expect(filterTreeByHiddenPaths(tree, ["C:\\Anime"])).toBeNull();
  });
});
