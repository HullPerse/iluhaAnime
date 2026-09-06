import { describe, expect, it } from "vitest";

import { detectLanguages, formatSize, parseSize, qualityMatch } from "@/lib/search/format.utils";

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

describe("qualityMatch", () => {
  it("matches 1080p in title", () => {
    expect(qualityMatch("[Group] Anime Title [1080p][HEVC]", "1080p")).toBe(true);
  });

  it("matches 720p in title", () => {
    expect(qualityMatch("[Group] Anime Title [720p]", "720p")).toBe(true);
  });

  it("does not match when quality absent", () => {
    expect(qualityMatch("[Group] Anime Title [HEVC]", "1080p")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(qualityMatch("[Group] Anime [1080P]", "1080p")).toBe(true);
  });
});

describe("parseSize", () => {
  it("parses MiB", () => {
    expect(parseSize("432.6 MiB")).toBe(432.6 * 1_048_576);
  });

  it("parses GiB", () => {
    expect(parseSize("1.5 GiB")).toBe(1.5 * 1_073_741_824);
  });

  it("returns 0 for unknown format", () => {
    expect(parseSize("unknown")).toBe(0);
  });

  it("parses plain bytes", () => {
    expect(parseSize("512 B")).toBe(512);
  });
});

describe("formatSize", () => {
  it("formats MiB with two decimals", () => {
    expect(formatSize("432.6 MiB")).toBe("432.60 MiB");
  });

  it("formats GiB with two decimals", () => {
    expect(formatSize("1.5 GiB")).toBe("1.50 GiB");
  });

  it("returns raw string if no match", () => {
    expect(formatSize("unknown")).toBe("unknown");
  });
});
