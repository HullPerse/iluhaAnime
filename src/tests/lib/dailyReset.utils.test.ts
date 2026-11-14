import { describe, expect, it } from "vitest";

import { dailyGameDay, formatResetCountdown, nextDailyResetAt } from "@/lib/daily/reset.utils";

const iso = (value: number): string => new Date(value).toISOString();

describe("daily reset schedule", () => {
  it("resets at 12:00 MSK and rolls over to the next day at the boundary", () => {
    expect(iso(nextDailyResetAt(Date.parse("2026-11-14T08:59:59Z")))).toBe(
      "2026-11-14T09:00:00.000Z"
    );
    expect(iso(nextDailyResetAt(Date.parse("2026-11-14T09:00:00Z")))).toBe(
      "2026-11-15T09:00:00.000Z"
    );
    expect(iso(nextDailyResetAt(Date.parse("2026-11-14T23:00:00Z")))).toBe(
      "2026-11-15T09:00:00.000Z"
    );
  });

  it("changes the game day at noon MSK", () => {
    expect(dailyGameDay(Date.parse("2026-11-14T08:59:59Z"))).toBe("2026-11-13");
    expect(dailyGameDay(Date.parse("2026-11-14T09:00:00Z"))).toBe("2026-11-14");
    expect(dailyGameDay(Date.parse("2026-11-14T23:59:59Z"))).toBe("2026-11-14");
  });

  it("formats the countdown without negative values", () => {
    expect(formatResetCountdown(5 * 3_600_000 + 3 * 60_000 + 2_000)).toBe("05:03:02");
    expect(formatResetCountdown(0)).toBe("00:00:00");
    expect(formatResetCountdown(-1_000)).toBe("00:00:00");
  });
});
