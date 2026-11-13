import { describe, expect, it } from "vitest";

import { formatCardDate, formatCardRelativeDate } from "@/lib/cards/format.utils";

const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
const ago = (seconds: number) => Math.floor(NOW / 1000) - seconds;

describe("card date formatting", () => {
  it("formats recent timestamps as relative phrases", () => {
    expect(formatCardRelativeDate(ago(5), "en", NOW)).toBe("less than a minute ago");
    expect(formatCardRelativeDate(ago(120), "en", NOW)).toBe("2 minutes ago");
    expect(formatCardRelativeDate(ago(7_200), "en", NOW)).toBe("about 2 hours ago");
    expect(formatCardRelativeDate(ago(86_400), "en", NOW)).toBe("1 day ago");
    expect(formatCardRelativeDate(ago(604_800), "en", NOW)).toBe("7 days ago");
    expect(formatCardRelativeDate(ago(7_200), "ru", NOW)).toBe("около 2 часов назад");
  });

  it("returns an empty string for a missing timestamp", () => {
    expect(formatCardRelativeDate(0, "en", NOW)).toBe("");
    expect(formatCardDate(0, "en")).toBe("");
  });
});
