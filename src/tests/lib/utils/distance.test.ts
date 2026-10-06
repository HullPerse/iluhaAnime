import { describe, expect, it } from "vitest";

import { formatDistanceToNowOwn } from "@/lib/utils/distance.utils";

const NOW = new Date(2026, 5, 15, 12, 0, 0).getTime();

const ORACLE: [number, string, string][] = [
  [10, "less than a minute ago", "меньше минуты назад"],
  [50, "1 minute ago", "1 минуту назад"],
  [90, "2 minutes ago", "2 минуты назад"],
  [300, "5 minutes ago", "5 минут назад"],
  [2640, "44 minutes ago", "44 минуты назад"],
  [3000, "about 1 hour ago", "около 1 часа назад"],
  [7200, "about 2 hours ago", "около 2 часов назад"],
  [82800, "about 23 hours ago", "около 23 часов назад"],
  [108000, "1 day ago", "1 день назад"],
  [172800, "2 days ago", "2 дня назад"],
  [864000, "10 days ago", "10 дней назад"],
  [2592000, "about 1 month ago", "около 1 месяца назад"],
  [3456000, "about 1 month ago", "около 1 месяца назад"],
  [4320000, "about 2 months ago", "около 2 месяцев назад"],
  [6048000, "2 months ago", "2 месяца назад"],
  [17280000, "7 months ago", "7 месяцев назад"],
  [34560000, "about 1 year ago", "около 1 года назад"],
  [43200000, "over 1 year ago", "больше 1 года назад"],
  [69120000, "about 2 years ago", "около 2 лет назад"],
  [-7200, "in about 2 hours", "приблизительно через 2 часа"],
];

describe("distance oracle", () => {
  it.each(ORACLE)("delta %is pins en=%s ru=%s", (delta, en, ru) => {
    const dateMs = NOW - delta * 1000;
    expect(formatDistanceToNowOwn(dateMs, "en", NOW)).toBe(en);
    expect(formatDistanceToNowOwn(dateMs, "ru", NOW)).toBe(ru);
  });

  it("rejects invalid dates with a stable RangeError", () => {
    expect(() => formatDistanceToNowOwn(Number.NaN, "en", NOW)).toThrow(
      new RangeError("Invalid time value")
    );
    expect(() => formatDistanceToNowOwn(Number.NaN, "ru", NOW)).toThrow(
      new RangeError("Invalid time value")
    );
  });

  it("accepts Date objects identically to timestamps", () => {
    const dateMs = NOW - 7200 * 1000;
    expect(formatDistanceToNowOwn(new Date(dateMs), "en", NOW)).toBe(
      formatDistanceToNowOwn(dateMs, "en", NOW)
    );
    expect(formatDistanceToNowOwn(new Date(dateMs), "ru", NOW)).toBe(
      formatDistanceToNowOwn(dateMs, "ru", NOW)
    );
  });
});
