import { describe, expect, it } from "vitest";

import { translate } from "@/lib/locale/i18n.utils";
import { queueDepthSteps } from "@/lib/player/queue.utils";
import { fileNameFromPath, clearParseCache, formatParsedTitle } from "@/lib/player/title.utils";
import {
  buildOutputPath,
  buildTree,
  filterTreeByPaths,
  flattenTree,
  summarizeTree,
} from "@/lib/player/tree.utils";
import {
  filterTreeByHiddenPaths,
  isPlayerPathHidden,
  normalizePlayerPath,
} from "@/lib/player/visibility.utils";
import type { FolderNode } from "@/types/torrent";
import type { UpscaleQueueItem } from "@/types/upscale";

describe("player/queue", () => {
  const ru = (key: Parameters<typeof translate>[1]) => translate("ru", key);

  function upscale(overrides: Partial<UpscaleQueueItem> = {}): UpscaleQueueItem {
    return {
      id: "q1",
      jobType: "upscale",
      filePath: "/a.mkv",
      outputPath: "/b.mkv",
      name: "a.mkv",
      config: {
        width: 0,
        height: 0,
        targetFps: null,
        interpolate: false,
        quality: "balanced",
        gpuBackend: "gpu",
        videoCodec: "hevc10",
        aiUpscaler: null,
        selectedShaders: ["Upscale x2", "Deband"],
      },
      status: "processing",
      progress: 41,
      ...overrides,
    };
  }

  describe("queueDepthSteps", () => {
    it("maps backend stages onto extract/upscale/encode", () => {
      const steps = queueDepthSteps(upscale({ stage: "upscaling" }), ru);
      expect(steps.map((s) => s.label)).toEqual(["Извлечение", "Апскейл", "Кодирование"]);
      expect(steps[0]?.done).toBe(true);
      expect(steps[1]?.active).toBe(true);
      expect(steps[1]?.percent).toBe(41);
      expect(steps[2]?.done).toBe(false);
    });

    it("names the upscaler and codec in step details", () => {
      const steps = queueDepthSteps(
        upscale({
          stage: "encoding",
          config: { ...(upscale().config as object), aiUpscaler: "realcugan" } as never,
        }),
        ru
      );
      expect(steps[1]?.detail).toBe("realcugan");
      expect(steps[2]?.detail).toBe("hevc10");
      expect(steps[2]?.active).toBe(true);
    });

    it("marks everything done on completion", () => {
      const steps = queueDepthSteps(upscale({ status: "done", progress: 100 }), ru);
      expect(steps.every((s) => s.done && s.percent === 100)).toBe(true);
    });

    it("keeps queued items pending", () => {
      const steps = queueDepthSteps(
        upscale({ status: "queued", progress: 0, stage: undefined }),
        ru
      );
      expect(steps.every((s) => !s.done && !s.active && s.percent === 0)).toBe(true);
    });

    it("renders convert jobs as a single step", () => {
      const steps = queueDepthSteps(
        {
          ...upscale({ status: "processing", progress: 10 }),
          jobType: "convert",
          config: { targetFormat: "mp4", copyStreams: true },
        },
        ru
      );
      expect(steps.length).toBe(1);
      expect(steps[0]?.label).toBe("Конверт");
      expect(steps[0]?.detail).toBe("mp4");
      expect(steps[0]?.active).toBe(true);
    });
  });
});

describe("player/visibility", () => {
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
      expect(isPlayerPathHidden("C:\\Anime\\Hidden\\episode.mkv", ["c:/anime/hidden"])).toBe(true);
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
});

describe("player/tree", () => {
  function makeEntry(path: string, name: string, size = 100) {
    return { name, path, size };
  }

  describe("buildTree", () => {
    it("builds a flat root with files directly inside", () => {
      const tree = buildTree([makeEntry("C:\\Anime\\movie.mkv", "movie.mkv")], "C:\\Anime");
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
      expect(tree.children[0].files.map((f) => f.name)).toEqual(["ep1.mkv", "ep2.mkv"]);
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
      const tree = buildTree([makeEntry("C:\\Anime\\movie.mkv", "movie.mkv")], "C:\\Anime");
      expect(filterTreeByPaths(tree, new Set(["C:\\missing.mkv"]))).toBeNull();
    });
  });

  describe("summarizeTree", () => {
    it("counts files and bytes recursively", () => {
      const tree = buildTree(
        [
          makeEntry("C:\\Anime\\movie.mkv", "movie.mkv", 100),
          makeEntry("C:\\Anime\\One Piece\\ep1.mkv", "ep1.mkv", 200),
          makeEntry("C:\\Anime\\One Piece\\ep2.mkv", "ep2.mkv", 300),
        ],
        "C:\\Anime"
      );
      expect(summarizeTree(tree)).toEqual({ count: 3, bytes: 600 });
    });

    it("reports zero for an empty tree", () => {
      expect(summarizeTree(buildTree([], "C:\\Anime"))).toEqual({ count: 0, bytes: 0 });
    });
  });

  describe("flattenTree", () => {
    it("flattens root files at depth 1 when the root is open", () => {
      const tree = buildTree(
        [makeEntry("C:\\Anime\\a.mkv", "a.mkv"), makeEntry("C:\\Anime\\b.mp4", "b.mp4")],
        "C:\\Anime"
      );
      const items = flattenTree(tree, new Set(), "", undefined, 0);
      expect(items).toHaveLength(2);
      expect(items.every((i) => i.kind === "file" && i.depth === 1)).toBe(true);
    });

    it("pushes folder items for closed children without their files", () => {
      const tree = buildTree([makeEntry("C:\\Anime\\Movies\\c.mkv", "c.mkv")], "C:\\Anime");
      const items = flattenTree(tree, new Set(), "", undefined, 0);
      const folders = items.filter((i) => i.kind === "folder");
      expect(folders).toHaveLength(1);
      expect(folders[0].kind === "folder" && folders[0].node.name).toBe("Movies");
      expect(items.some((i) => i.kind === "file")).toBe(false);
    });

    it("expands open children and includes their files", () => {
      const tree = buildTree([makeEntry("C:\\Anime\\Movies\\c.mkv", "c.mkv")], "C:\\Anime");
      const items = flattenTree(tree, new Set(["C:\\Anime/Movies"]), "", undefined, 0);
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
        [makeEntry("C:\\Anime\\a.mkv", "a.mkv"), makeEntry("C:\\Anime\\b.mp4", "b.mp4")],
        "C:\\Anime"
      );
      const items = flattenTree(tree, new Set(), "", new Set(["mp4"]), 0);
      const files = items.filter((i) => i.kind === "file");
      expect(files).toHaveLength(1);
      expect(files[0].kind === "file" && files[0].file.name).toBe("a.mkv");
    });

    it("prunes folders whose content was filtered out by track extensions", () => {
      const tree = buildTree([makeEntry("C:\\Anime\\Subs\\ep1.ass", "ep1.ass")], "C:\\Anime");
      const items = flattenTree(tree, new Set(), "", undefined, 0, new Set(["ass"]));
      expect(items).toHaveLength(0);
    });
  });

  describe("buildOutputPath", () => {
    it("inserts the suffix before the extension", () => {
      expect(buildOutputPath("C:\\Anime\\ep1.mkv", ".720p")).toBe("C:\\Anime\\ep1.720p.mkv");
    });

    it("appends the suffix when there is no extension", () => {
      expect(buildOutputPath("ep1", "-tag")).toBe("ep1-tag");
    });

    it("handles dotted filenames correctly", () => {
      expect(buildOutputPath("file.tar.gz", ".x")).toBe("file.tar.x.gz");
    });
  });
});

describe("player/title", () => {
  const ru = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
    translate("ru", key, vars);

  describe("formatParsedTitle", () => {
    it("formats a simple episode", () => {
      expect(formatParsedTitle("[Erai-raws] Naruto - 01 [1080p].mkv", ru)).toBe("Naruto, Серия 1");
    });

    it("includes season when present", () => {
      expect(formatParsedTitle("Sword Art Online - S01E02 - Title.mkv", ru)).toBe(
        "Sword Art Online, Сезон 1, Серия 2"
      );
    });

    it("handles zero-padded episode numbers", () => {
      expect(formatParsedTitle("One Piece 001.mkv", ru)).toBe("One Piece, Серия 1");
    });

    it("returns the same result on repeated calls", () => {
      clearParseCache();
      const first = formatParsedTitle("[Erai-raws] Naruto - 01 [1080p].mkv", ru);
      const second = formatParsedTitle("[Erai-raws] Naruto - 01 [1080p].mkv", ru);
      expect(second).toBe(first);
    });

    it("stays correct after cache eviction pressure", () => {
      clearParseCache();
      for (let i = 0; i < 600; i++) {
        formatParsedTitle(`[Group] Some Anime ${i} - 01 [1080p].mkv`, ru);
      }
      expect(formatParsedTitle("[Erai-raws] Naruto - 01 [1080p].mkv", ru)).toBe("Naruto, Серия 1");
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
});
