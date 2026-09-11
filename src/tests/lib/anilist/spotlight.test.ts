import { describe, expect, it } from "vitest";

import {
  spotlightBoundaryMs,
  spotlightPageIndex,
  spotlightPeriodKey,
} from "@/lib/anilist/spotlight.utils";

describe("spotlightPeriodKey", () => {
  it("keys days by local calendar date", () => {
    expect(spotlightPeriodKey("day", new Date(2026, 8, 10, 23, 59))).toBe("2026-09-10");
    expect(spotlightPeriodKey("day", new Date(2026, 8, 11, 0, 0))).toBe("2026-09-11");
  });

  it("keys months by year and month", () => {
    expect(spotlightPeriodKey("month", new Date(2026, 0, 31))).toBe("2026-01");
    expect(spotlightPeriodKey("month", new Date(2026, 1, 1))).toBe("2026-02");
  });

  it("keeps the ISO week across the Sunday boundary", () => {
    const sunday = spotlightPeriodKey("week", new Date(2026, 8, 13));
    const monday = spotlightPeriodKey("week", new Date(2026, 8, 14));
    expect(sunday).not.toBe(monday);
    expect(monday).toMatch(/^2026-W\d{2}$/);
  });
});

describe("spotlightBoundaryMs", () => {
  it("points days at the next local midnight", () => {
    const now = new Date(2026, 8, 10, 15, 30).getTime();
    expect(new Date(spotlightBoundaryMs("day", now))).toEqual(new Date(2026, 8, 11, 0, 0));
  });

  it("points weeks at Monday midnight", () => {
    const thursday = new Date(2026, 8, 10, 15, 30).getTime();
    expect(new Date(spotlightBoundaryMs("week", thursday))).toEqual(new Date(2026, 8, 14, 0, 0));
  });

  it("points months at the first day midnight", () => {
    const now = new Date(2026, 0, 31, 12, 0).getTime();
    expect(new Date(spotlightBoundaryMs("month", now))).toEqual(new Date(2026, 1, 1, 0, 0));
  });
});

describe("spotlightPageIndex", () => {
  it("is deterministic per kind and period", () => {
    expect(spotlightPageIndex("day", "2026-09-10", 5000, 50)).toEqual(
      spotlightPageIndex("day", "2026-09-10", 5000, 50)
    );
    expect(spotlightPageIndex("day", "2026-09-10", 5000, 50)).not.toEqual(
      spotlightPageIndex("day", "2026-09-11", 5000, 50)
    );
  });
  it("stays within the page and index bounds", () => {
    const { page, index } = spotlightPageIndex("month", "2026-09", 5000, 50);
    expect(page).toBeGreaterThanOrEqual(1);
    expect(page).toBeLessThanOrEqual(100);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(50);
  });

  it("survives an empty pool", () => {
    const { page } = spotlightPageIndex("week", "2026-W37", 0, 50);
    expect(page).toBe(1);
  });
  it("degrades gracefully on non-positive perPage and negative totals", () => {
    const zero = spotlightPageIndex("day", "2026-09-10", 5000, 0);
    expect(zero.index).toBe(0);
    expect(zero.page).toBeGreaterThanOrEqual(1);
    const negative = spotlightPageIndex("day", "2026-09-10", 5000, -5);
    expect(negative.index).toBe(0);
    expect(spotlightPageIndex("day", "2026-09-10", -100, 50).page).toBe(1);
  });
  it("seeds kinds independently for the same period key", () => {
    expect(spotlightPageIndex("day", "2026-09", 5000, 50)).not.toEqual(
      spotlightPageIndex("week", "2026-09", 5000, 50)
    );
  });

  it("varies the index across periods", () => {
    const indexes = Array.from({ length: 12 }, (_, m) =>
      spotlightPageIndex("month", `2026-${String(m + 1).padStart(2, "0")}`, 5000, 50)
    ).map(({ index }) => index);
    expect(new Set(indexes).size).toBeGreaterThan(1);
  });
});
