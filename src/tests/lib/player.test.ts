import { describe, expect, it, vi } from "vitest";

import { translate } from "@/lib/locale/i18n.utils";
import {
  appendFiles,
  appendFilesQuiet,
  audioOptions,
  colorOptions,
  diffOptions,
  hdrOptions,
  parseTimecode,
  profileOptions,
  selectTrack,
  transformOptions,
} from "@/lib/player/playback.utils";
import { queueDepthSteps } from "@/lib/player/queue.utils";
import { clearMediaParseCache, fileNameFromPath } from "@/lib/media/parse.utils";
import { formatParsedTitle } from "@/lib/player/title.utils";
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
import { DEFAULT_PLAYER_SETTINGS } from "@/store/player.store";
import type { FolderNode } from "@/types/torrent";
import type { UpscaleQueueItem } from "@/types/upscale";
import type { PlayerSettings } from "@/types/videoPlayer";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

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

    it("activates the first step for unknown processing stages", () => {
      const steps = queueDepthSteps(upscale({ status: "processing", progress: 5 }), ru);
      expect(steps[0]?.active).toBe(true);
      expect(steps[0]?.percent).toBe(5);
    });

    it("maps the extracting stage onto the first step", () => {
      const steps = queueDepthSteps(upscale({ status: "processing", stage: "extracting" }), ru);
      expect(steps[0]?.active).toBe(true);
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

    it("removes a hidden file inside a visible folder", () => {
      const filtered = filterTreeByHiddenPaths(tree, ["C:/Anime/Visible/episode.mkv"]);
      expect(filtered?.children.map((child) => child.name)).toEqual(["Hidden"]);
      expect(filtered?.files.map((file) => file.name)).toEqual(["movie.mkv"]);
    });
  });
});

describe("player/timecode", () => {
  it("parses seconds, mm:ss and hh:mm:ss", () => {
    expect(parseTimecode("90")).toBe(90);
    expect(parseTimecode("1:30")).toBe(90);
    expect(parseTimecode("1:02:03")).toBe(3723);
    expect(parseTimecode("1:02:03.5")).toBe(3723.5);
    expect(parseTimecode("0:00:10,25")).toBe(10.25);
  });

  it("rejects malformed and out-of-range input", () => {
    expect(parseTimecode("")).toBeNull();
    expect(parseTimecode("::")).toBeNull();
    expect(parseTimecode("1:2:3:4")).toBeNull();
    expect(parseTimecode("abc")).toBeNull();
    expect(parseTimecode("-5")).toBeNull();
    expect(parseTimecode("1:60")).toBeNull();
    expect(parseTimecode("1:02:75")).toBeNull();
    expect(parseTimecode("1.5:30")).toBeNull();
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

    it("does not strip the root in the middle of a path", () => {
      const tree = buildTree([makeEntry("D:\\X\\C:\\Anime\\ep.mkv", "ep.mkv")], "C:\\Anime");
      expect(tree.files.map((f) => f.name)).toEqual([]);
      expect(tree.children.length).toBeGreaterThan(0);
    });

    it("normalizes separators in node paths", () => {
      const tree = buildTree([makeEntry("C:\\Anime\\Sub\\ep.mkv", "ep.mkv")], "C:\\Anime");
      expect(tree.path).toBe("C:/Anime");
      expect(tree.children[0].path).toBe("C:/Anime/Sub");
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
      const items = flattenTree(tree, new Set(["C:/Anime/Movies"]), "", undefined, 0);
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
        "Sword Art Online, Сезон 1, Серия 2: Title"
      );
    });

    it("handles zero-padded episode numbers", () => {
      expect(formatParsedTitle("One Piece 001.mkv", ru)).toBe("One Piece, Серия 1");
    });

    it("reads years as years for movies", () => {
      expect(formatParsedTitle("Barbie.2023.1080p.WEBRip.x264-Delia_EniaHD.mkv", ru)).toBe(
        "Barbie"
      );
    });

    it("strips season suffixes from the title", () => {
      expect(
        formatParsedTitle("[BudLightSubs] Boku no Hero Academia Illegals S2 - 01 [1080p].mkv", ru)
      ).toBe("Boku no Hero Academia Illegals, Сезон 2, Серия 1");
    });

    it("uses the folder for number-prefixed files", () => {
      expect(
        formatParsedTitle(
          "133-134. Женщина, что полюбила Сещемару.mkv",
          ru,
          "Anime/Inuyasha"
        )
      ).toBe("Inuyasha, Серии 133-134: Женщина, что полюбила Сещемару");
    });

    it("returns the same result on repeated calls", () => {
      clearMediaParseCache();
      const first = formatParsedTitle("[Erai-raws] Naruto - 01 [1080p].mkv", ru);
      const second = formatParsedTitle("[Erai-raws] Naruto - 01 [1080p].mkv", ru);
      expect(second).toBe(first);
    });

    it("stays correct after cache eviction pressure", () => {
      clearMediaParseCache();
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

    it("handles trailing and mixed separators like the previous split-based version", () => {
      expect(fileNameFromPath("a/b/")).toBe("a/b/");
      expect(fileNameFromPath("a\\")).toBe("a\\");
      expect(fileNameFromPath("a\\b/c.mkv")).toBe("c.mkv");
      expect(fileNameFromPath("")).toBe("");
    });
  });
});

describe("player/playback options", () => {
  function settings(overrides: Partial<PlayerSettings>): PlayerSettings {
    return { ...DEFAULT_PLAYER_SETTINGS, ...overrides };
  }

  it("maps profiles onto demuxer readahead presets", () => {
    expect(profileOptions("basic")).toEqual({ "demuxer-readahead-secs": 1 });
    expect(profileOptions("speed")).toEqual({ "demuxer-readahead-secs": 0.5 });
    expect(profileOptions("quality")).toEqual({ "demuxer-readahead-secs": 10 });
  });

  it("restores mpv auto HDR defaults and clamps manual peaks", () => {
    expect(hdrOptions(settings({ toneMap: "auto" }))).toEqual({
      "tone-mapping": "auto",
      "target-peak": "auto",
      "hdr-compute-peak": "auto",
    });
    expect(
      hdrOptions(settings({ toneMap: "manual", targetPeak: 1000, hdrComputePeak: true }))
    ).toEqual({
      "tone-mapping": "clip",
      "target-peak": "1000",
      "hdr-compute-peak": "yes",
    });
    expect(hdrOptions(settings({ toneMap: "manual", targetPeak: 50 }))["target-peak"]).toBe("100");
    expect(hdrOptions(settings({ toneMap: "manual", targetPeak: 20_000 }))["target-peak"]).toBe(
      "10000"
    );
    expect(
      hdrOptions(settings({ toneMap: "manual", hdrComputePeak: false }))["hdr-compute-peak"]
    ).toBe("no");
  });

  it("maps colorspace selects onto string options", () => {
    expect(colorOptions(settings({ targetPrim: "bt.709", targetTrc: "srgb" }))).toEqual({
      "target-prim": "bt.709",
      "target-trc": "srgb",
    });
  });

  it("toggles the loudnorm audio filter and clears it when off", () => {
    expect(audioOptions(settings({ loudnorm: true }))).toEqual({
      af: "loudnorm",
    });
    expect(audioOptions(settings({ loudnorm: false }))).toEqual({ af: "" });
  });

  it("maps UI percents onto mpv -100..100 scales", () => {
    const options = transformOptions(
      settings({ brightness: 150, contrast: 50, saturation: 200, hue: -50 })
    );
    expect(options["brightness"]).toBe(50);
    expect(options["contrast"]).toBe(-50);
    expect(options["saturation"]).toBe(100);
    expect(options["hue"]).toBe(-50);
  });

  it("clamps percents and hue to mpv ranges", () => {
    const options = transformOptions(settings({ brightness: 300, hue: 360 }));
    expect(options["brightness"]).toBe(100);
    expect(options["hue"]).toBe(100);
  });

  it("maps zoom onto video-zoom and resets keepaspect", () => {
    expect(transformOptions(settings({ zoom: 1 }))["video-zoom"]).toBe(0);
    expect(transformOptions(settings({ zoom: 2 }))["video-zoom"]).toBe(1);
    expect(transformOptions(settings({ zoom: 0.5 }))["video-zoom"]).toBe(-1);
    expect(transformOptions(settings({ zoom: 1 }))).not.toHaveProperty("panscan");
    expect(transformOptions(settings({ aspectRatio: "fill" }))["keepaspect"]).toBe(false);
    expect(transformOptions(settings({ aspectRatio: "contain" }))["keepaspect"]).toBe(true);
  });

  it("always sends vf and subtitle options so resets clear mpv state", () => {
    const options = transformOptions(settings({}));
    expect(options["vf"]).toBe("");
    expect(options["sub-font-size"]).toBe(55);
    expect(options["sub-font"]).toBe("Arial");
    // Subtitles must never use the video margins: those are the UI bars.
    expect(options["sub-use-margins"]).toBe(false);
    expect(options["sub-ass-force-margins"]).toBe(false);
    const filtered = transformOptions(settings({ flipH: true, blur: 5 }));
    expect(filtered["vf"]).toContain("hflip");
    expect(filtered["vf"]).toContain("gblur");
  });

  it("does not emit gamma without a UI control", () => {
    expect(transformOptions(settings({}))).not.toHaveProperty("gamma");
  });

  it("diffs option maps down to the changed entries", () => {
    expect(diffOptions({ a: 1, b: "x" }, { a: 1, b: "x" })).toEqual({});
    expect(diffOptions({ a: 1, b: "x" }, { a: 2, b: "x" })).toEqual({ a: 2 });
    expect(diffOptions({ a: 1 }, { a: 1, b: "new" })).toEqual({ b: "new" });
  });

  it("isolates a single slider drag inside transformOptions", () => {
    const prev = transformOptions(settings({}));
    const next = transformOptions(settings({ brightness: 150 }));
    expect(diffOptions(prev, next)).toEqual({ brightness: 50 });
  });

  it("sends track ids as strings the wrapper accepts", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockClear();
    await selectTrack("audio", 2);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("player_set_property", {
      name: "aid",
      value: "2",
    });
    await selectTrack("sub", "no");
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("player_set_property", {
      name: "sid",
      value: "no",
    });
  });
});

describe("player/playlist append", () => {
  it("queues picked files without starting playback", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockClear();
    await appendFilesQuiet(["C:\\a.mkv", "C:\\b.mkv"]);
    expect(vi.mocked(invoke)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("player_append_files", {
      files: ["C:\\a.mkv", "C:\\b.mkv"],
      mode: "append",
    });
  });

  it("keeps autoplay for drag and drop", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockClear();
    await appendFiles(["C:\\a.mkv"]);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("player_append_files", {
      files: ["C:\\a.mkv"],
      mode: "append-play",
    });
  });

  it("skips the invoke when there is nothing to append", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockClear();
    await appendFiles([]);
    await appendFilesQuiet([]);
    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  });
});
