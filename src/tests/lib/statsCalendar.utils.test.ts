import { describe, expect, it } from "vitest";

import { buildWeekDays, calendarTone } from "@/lib/anilist/statsCalendar.utils";
import type { AiringEntry } from "@/types/anilist/stats.anilist";

function entry(id: number, date: Date, title = `Show ${id}`): AiringEntry {
  return {
    id,
    title,
    airingAt: Math.floor(date.getTime() / 1000),
    episode: 1,
    coverUrl: null,
  };
}

describe("buildWeekDays", () => {
  const from = new Date(2026, 10, 21, 9);

  it("returns seven local days with empty buckets", () => {
    const days = buildWeekDays([], from);
    expect(days).toHaveLength(7);
    expect(days.map((day) => new Date(day.dayStartMs).getDate())).toEqual([
      21, 22, 23, 24, 25, 26, 27,
    ]);
    expect(days.every((day) => day.entries.length === 0)).toBe(true);
  });

  it("groups entries by local day and sorts them by time", () => {
    const days = buildWeekDays(
      [
        entry(1, new Date(2026, 10, 22, 18)),
        entry(2, new Date(2026, 10, 21, 20)),
        entry(3, new Date(2026, 10, 22, 9)),
      ],
      from
    );
    expect(days[0]?.entries.map((item) => item.id)).toEqual([2]);
    expect(days[1]?.entries.map((item) => item.id)).toEqual([3, 1]);
    expect(days[2]?.entries).toEqual([]);
  });

  it("drops entries outside the week and duplicate media", () => {
    const days = buildWeekDays(
      [
        entry(1, new Date(2026, 10, 21, 20)),
        entry(1, new Date(2026, 10, 21, 21), "Duplicate"),
        entry(2, new Date(2026, 10, 20, 20)),
        entry(3, new Date(2026, 10, 28, 20)),
      ],
      from
    );
    expect(days.flatMap((day) => day.entries).map((item) => item.id)).toEqual([1]);
  });
});

describe("calendarTone", () => {
  it("gives today priority over the weekend", () => {
    expect(calendarTone({ isToday: true, isWeekend: true })).toEqual({
      cell: "bg-secondary/10",
      dayNumber: "bg-secondary text-title-text font-bold",
    });
  });

  it("marks a weekend that is not today", () => {
    expect(calendarTone({ isToday: false, isWeekend: true })).toEqual({
      cell: "bg-surface/40",
      dayNumber: "text-destructive font-bold",
    });
  });

  it("uses the default surface on a weekday", () => {
    expect(calendarTone({ isToday: false, isWeekend: false })).toEqual({
      cell: "bg-field",
      dayNumber: "text-text font-bold",
    });
  });
});
