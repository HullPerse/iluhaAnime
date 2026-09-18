import { describe, expect, it } from "vitest";

import { translate } from "@/lib/locale/i18n.utils";
import { fileNameFromPath, clearParseCache, formatParsedTitle } from "@/lib/player/title.utils";

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
