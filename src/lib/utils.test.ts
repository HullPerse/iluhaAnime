import { describe, it, expect } from "vitest";
import { detectLanguages, formatSize, formatTime, parseVTT, cn } from "./utils";

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

describe("formatTime", () => {
  it("returns 00:00 for invalid input", () => {
    expect(formatTime(-1)).toBe("0:00");
    expect(formatTime(Infinity)).toBe("0:00");
    expect(formatTime(NaN)).toBe("0:00");
  });

  it("formats seconds only", () => {
    expect(formatTime(45)).toBe("0:45");
    expect(formatTime(125)).toBe("2:05");
  });

  it("formats hours", () => {
    expect(formatTime(3661)).toBe("1:01:01");
  });
});

describe("parseVTT", () => {
  it("parses simple VTT content", () => {
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nHello\n\n00:00:06.000 --> 00:00:10.000\nWorld";
    const cues = parseVTT(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBe(1);
    expect(cues[0].end).toBe(5);
    expect(cues[0].text).toBe("Hello");
    expect(cues[1].text).toBe("World");
  });

  it("returns empty for empty input", () => {
    expect(parseVTT("")).toEqual([]);
  });
});

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });
});
