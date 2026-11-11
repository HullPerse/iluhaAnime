import { describe, expect, it } from "vitest";

import { calendarTone } from "@/lib/anilist/statsCalendar.utils";

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
