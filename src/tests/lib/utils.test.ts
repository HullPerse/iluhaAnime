import { describe, it, expect } from "vitest";

import {
  detectLanguages,
  formatSize,
  cn,
  parseSize,
  qualityMatch,
  collectFileIndices,
} from "@/lib/index.utils";
import { joinMediaPath } from "@/lib/media.utils";
import type { TorrentTreeNode } from "@/lib/torrent.utils";

describe("detectLanguages", () => {
  it("detects Russian from RUS tag", () => {
    const result = detectLanguages("[Erai-raws] Anime [1080p][RUS]");
    expect(result).toContainEqual({ code: "ru", label: "RU" });
  });

  it("detects English from ENG tag", () => {
    const result = detectLanguages("[Erai-raws] Anime [1080p][ENG]");
    expect(result).toContainEqual({ code: "en", label: "EN" });
  });

  it("detects MultiSub", () => {
    const result = detectLanguages("[Erai-raws] Anime [1080p][MultiSub]");
    expect(result).toContainEqual({ code: "multi", label: "Multi" });
  });

  it("detects Dual Audio", () => {
    const result = detectLanguages("[Erai-raws] Anime [1080p][Dual-Audio]");
    expect(result).toContainEqual({ code: "dual", label: "Dual" });
  });

  it("detects multiple languages", () => {
    const result = detectLanguages("[Erai-raws] Anime [1080p][RUS][ENG]");
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty array for unknown language", () => {
    const result = detectLanguages("[Some] Anime [1080p]");
    expect(result).toEqual([]);
  });
});

describe("formatSize", () => {
  it("formats size with two decimals", () => {
    expect(formatSize("432.6 MiB")).toBe("432.60 MiB");
  });

  it("returns raw string if no match", () => {
    expect(formatSize("unknown")).toBe("unknown");
  });
});

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });
});

describe("joinMediaPath", () => {
  it("joins nested torrent paths without duplicate separators", () => {
    expect(joinMediaPath("C:\\Anime\\", "Season 1\\episode.mkv")).toBe(
      "C:\\Anime/Season 1\\episode.mkv"
    );
  });
});

describe("parseSize", () => {
  it("parses byte, KB, MB and GB values", () => {
    expect(parseSize("500 B")).toBe(500);
    expect(parseSize("1.5 KB")).toBe(1536);
    expect(parseSize("1.5 MB")).toBe(1_572_864);
    expect(parseSize("2 GiB")).toBe(2_147_483_648);
  });

  it("parses without an explicit unit as bytes", () => {
    expect(parseSize("42")).toBe(42);
  });

  it("returns 0 for garbage", () => {
    expect(parseSize("unknown")).toBe(0);
    expect(parseSize("")).toBe(0);
  });
});

describe("qualityMatch", () => {
  it("matches the quality token in the title", () => {
    expect(qualityMatch("Show 1080p", "1080p")).toBe(true);
    expect(qualityMatch("Show 1080P", "1080p")).toBe(true);
  });

  it("rejects mismatched quality", () => {
    expect(qualityMatch("Show 720p", "1080p")).toBe(false);
    expect(qualityMatch("Show", "1080p")).toBe(false);
  });
});

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
