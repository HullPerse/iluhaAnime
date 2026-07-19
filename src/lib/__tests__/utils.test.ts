import { describe, it, expect } from "vitest";
import {
  detectLanguages,
  formatSize,
  cn,
} from "../index.utils";

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
