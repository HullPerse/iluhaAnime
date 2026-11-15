import { describe, expect, it } from "vitest";

import { formatCardDate, formatCardRelativeDate } from "@/lib/cards/format.utils";

const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
const ago = (seconds: number) => Math.floor(NOW / 1000) - seconds;

describe("card date formatting", () => {
  it("formats recent timestamps as relative phrases", () => {
    expect(formatCardRelativeDate(ago(5), "ru", NOW)).toBe("меньше минуты назад");
    expect(formatCardRelativeDate(ago(120), "ru", NOW)).toBe("2 минуты назад");
    expect(formatCardRelativeDate(ago(7_200), "ru", NOW)).toBe("около 2 часов назад");
    expect(formatCardRelativeDate(ago(86_400), "ru", NOW)).toBe("1 день назад");
    expect(formatCardRelativeDate(ago(604_800), "ru", NOW)).toBe("7 дней назад");
  });

  it("returns an empty string for a missing timestamp", () => {
    expect(formatCardRelativeDate(0, "ru", NOW)).toBe("");
    expect(formatCardDate(0, "ru")).toBe("");
  });
});
