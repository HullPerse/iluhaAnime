import { describe, expect, it } from "vitest";

import { dayNightFrame, nowMinutesOf, parseDayTime } from "@/lib/settings/daynight.utils";

describe("daynight", () => {
  it("parses HH:MM to minutes", () => {
    expect(parseDayTime("08:00")).toBe(480);
    expect(parseDayTime("8:00")).toBe(480);
    expect(parseDayTime("23:59")).toBe(1439);
    expect(parseDayTime("24:00")).toBeNull();
    expect(parseDayTime("08:60")).toBeNull();
    expect(parseDayTime("eight")).toBeNull();
    expect(parseDayTime("")).toBeNull();
  });

  it("resolves the day frame inside bounds", () => {
    expect(dayNightFrame("08:00", "23:00", 480)).toBe("day");
    expect(dayNightFrame("08:00", "23:00", 1379)).toBe("day");
    expect(dayNightFrame("08:00", "23:00", 1380)).toBe("night");
    expect(dayNightFrame("08:00", "23:00", 479)).toBe("night");
    expect(dayNightFrame("08:00", "23:00", 0)).toBe("night");
  });

  it("resolves wrapped bounds overnight", () => {
    expect(dayNightFrame("22:00", "06:00", 1380)).toBe("day");
    expect(dayNightFrame("22:00", "06:00", 300)).toBe("day");
    expect(dayNightFrame("22:00", "06:00", 360)).toBe("night");
    expect(dayNightFrame("22:00", "06:00", 720)).toBe("night");
  });

  it("falls back to day on invalid bounds", () => {
    expect(dayNightFrame("xx", "23:00", 720)).toBe("day");
  });

  it("reads local minutes", () => {
    const date = new Date(2026, 0, 2, 3, 4);
    expect(nowMinutesOf(date)).toBe(184);
  });
});
