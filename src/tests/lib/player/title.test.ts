import { describe, expect, it } from "vitest";

import { translate } from "@/lib/locale/i18n.utils";
import { fileNameFromPath, formatETA, formatParsedTitle } from "@/lib/player/title.utils";

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
